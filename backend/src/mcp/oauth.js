/**
 * OAuth 2.1 for the MCP connector, so claude.ai (web and phone apps) can add
 * MoneyWise as a custom connector.
 *
 * The MCP SDK's mcpAuthRouter provides the endpoints (metadata, /register,
 * /authorize, /token, /revoke) and the PKCE check; this file supplies the
 * SQLite-backed provider behind them:
 * - registration only accepts claude.ai's callback as redirect URI;
 * - /authorize shows a password screen (MONEYWISE_PASSWORD), then a consent
 *   screen; both forms post back to /authorize, which re-validates every
 *   parameter before calling authorize() again;
 * - codes last 5 minutes and are single-use; access tokens last 1 hour;
 *   refresh tokens last 90 days and rotate on every use.
 *
 * Codes, nonces and tokens are stored as SHA-256 hashes. A confidential
 * client's secret is the exception: the SDK compares it as issued.
 * With MONEYWISE_PASSWORD unset none of this is mounted.
 */

import crypto from 'crypto';
import express from 'express';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
    InvalidClientMetadataError,
    InvalidGrantError,
    InvalidTargetError,
    InvalidTokenError,
    AccessDeniedError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import db from '../db/database.js';
import { verifyPassword } from '../routes/auth.js';

// claude.ai web, desktop and mobile all use this callback (claude.com/docs/connectors/building/authentication)
const ALLOWED_REDIRECT_URIS = ['https://claude.ai/api/mcp/auth_callback'];

const CODE_TTL_MS = 5 * 60 * 1000;
const CONSENT_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Failed password attempts: per IP, and in total (it's a single-user app, so an
// attacker rotating IPs still hits the global cap)
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 5;
const MAX_FAILURES_TOTAL = 20;

export function oauthEnabled() {
    return !!process.env.MONEYWISE_PASSWORD;
}

function publicOrigin() {
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
    return process.env.NODE_ENV === 'production'
        ? 'https://moneywise.fly.dev'
        : `http://localhost:${process.env.PORT || 3001}`;
}

const MCP_RESOURCE = `${publicOrigin()}/mcp`;

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = (prefix) => prefix + crypto.randomBytes(32).toString('base64url');
const sameResource = (a, b) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

// ==================== LOGIN RATE LIMIT ====================

const failures = []; // { ip, at }

function pruneFailures(now) {
    while (failures.length && failures[0].at < now - FAILURE_WINDOW_MS) failures.shift();
}

function loginBlocked(ip) {
    const now = Date.now();
    pruneFailures(now);
    return failures.length >= MAX_FAILURES_TOTAL
        || failures.filter(f => f.ip === ip).length >= MAX_FAILURES_PER_IP;
}

function recordFailure(ip) {
    failures.push({ ip, at: Date.now() });
}

// ==================== CLIENTS ====================

const clientsStore = {
    getClient(clientId) {
        const row = db.prepare('SELECT info FROM oauth_clients WHERE client_id = ?').get(clientId);
        return row ? JSON.parse(row.info) : undefined;
    },

    registerClient(client) {
        const bad = client.redirect_uris.filter(uri => !ALLOWED_REDIRECT_URIS.includes(String(uri)));
        if (bad.length) {
            console.warn(`[oauth] registration refused: redirect_uris ${bad.join(', ')} not allowed`);
            throw new InvalidClientMetadataError(`redirect_uri not allowed: ${bad.join(', ')}`);
        }
        db.prepare('INSERT INTO oauth_clients (client_id, info, created_at) VALUES (?, ?, ?)')
            .run(client.client_id, JSON.stringify(client), Date.now());
        console.log(`[oauth] client registered: "${client.client_name || 'unnamed'}" (${client.client_id})`);
        return client;
    },
};

// ==================== TOKENS ====================

function issueTokens(clientId, grantId, resource) {
    const now = Date.now();
    const accessToken = randomToken('mwa_');
    const refreshToken = randomToken('mwr_');
    const insert = db.prepare(`
        INSERT INTO oauth_tokens (token_hash, kind, client_id, grant_id, resource, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(hash(accessToken), 'access', clientId, grantId, resource, now, now + ACCESS_TTL_MS);
    insert.run(hash(refreshToken), 'refresh', clientId, grantId, resource, now, now + REFRESH_TTL_MS);
    return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL_MS / 1000,
        refresh_token: refreshToken,
    };
}

function revokeGrant(grantId) {
    db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL')
        .run(Date.now(), grantId);
}

// Revokes every OAuth token and pending code (e.g. a lost phone). Clients stay
// registered, so claude.ai can reconnect with a fresh login.
export function revokeAllOAuth() {
    const grants = db.prepare(`
        SELECT COUNT(DISTINCT grant_id) AS n FROM oauth_tokens
        WHERE kind = 'refresh' AND revoked_at IS NULL AND expires_at > ?
    `).get(Date.now()).n;
    db.transaction(() => {
        db.prepare('DELETE FROM oauth_tokens').run();
        db.prepare('DELETE FROM oauth_codes').run();
        db.prepare('DELETE FROM oauth_consents').run();
    })();
    console.log(`[oauth] all tokens revoked (${grants} active connection(s))`);
    return grants;
}

// Active connections: one per grant with a live refresh token
export function listOAuthConnections() {
    return db.prepare(`
        SELECT t.client_id, json_extract(c.info, '$.client_name') AS client_name,
               MIN(g.created_at) AS connected_at, MAX(t.created_at) AS last_refresh_at
        FROM oauth_tokens t
        JOIN (SELECT grant_id, MIN(created_at) AS created_at FROM oauth_tokens GROUP BY grant_id) g
          ON g.grant_id = t.grant_id
        LEFT JOIN oauth_clients c ON c.client_id = t.client_id
        WHERE t.kind = 'refresh' AND t.revoked_at IS NULL AND t.expires_at > ?
        GROUP BY t.grant_id
        ORDER BY connected_at
    `).all(Date.now());
}

function cleanupExpired() {
    try {
        const now = Date.now();
        db.prepare('DELETE FROM oauth_consents WHERE expires_at < ?').run(now);
        db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').run(now);
        db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ?').run(now);
    } catch (error) {
        console.error('[oauth] cleanup error:', error.message);
    }
}

setInterval(cleanupExpired, 60 * 60 * 1000);

// ==================== PAGES ====================

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// The OAuth parameters /authorize needs again when a form posts back to it
const AUTHORIZE_PARAMS = ['client_id', 'redirect_uri', 'response_type', 'code_challenge',
    'code_challenge_method', 'state', 'scope', 'resource'];

function hiddenFields(req) {
    const source = req.method === 'POST' ? req.body : req.query;
    return AUTHORIZE_PARAMS
        .filter(key => typeof source[key] === 'string')
        .map(key => `<input type="hidden" name="${key}" value="${escapeHtml(source[key])}">`)
        .join('\n');
}

function renderPage(res, status, title, body) {
    res.status(status)
        .set({
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://claude.ai; frame-ancestors 'none'",
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'no-referrer',
        })
        .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · MoneyWise</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #f5f6f8; color: #1f2933; margin: 0; padding: 16px; }
  main { max-width: 420px; margin: 8vh auto; background: #fff; border-radius: 12px; padding: 28px 24px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  h1 { font-size: 1.3rem; margin: 0 0 12px; }
  p { line-height: 1.5; margin: 0 0 14px; }
  .error { color: #b42318; background: #fef3f2; padding: 10px 12px; border-radius: 8px; }
  .note { color: #52606d; font-size: .9rem; }
  input[type=password] { width: 100%; box-sizing: border-box; font-size: 1rem; padding: 12px; border: 1px solid #cbd2d9; border-radius: 8px; margin-bottom: 14px; }
  .actions { display: flex; gap: 10px; }
  button { flex: 1; font-size: 1rem; padding: 12px; border-radius: 8px; border: 0; cursor: pointer; background: #2563eb; color: #fff; }
  button.secondary { background: #e4e7eb; color: #1f2933; }
</style></head>
<body><main>${body}</main></body></html>`);
}

function renderLogin(req, res, client, { status = 200, error } = {}) {
    renderPage(res, status, 'Sign in', `
<h1>💰 Sign in to MoneyWise</h1>
<p><strong>${escapeHtml(client.client_name || 'An app')}</strong> wants to connect to MoneyWise.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/authorize">
${hiddenFields(req)}
<input type="password" name="password" placeholder="MoneyWise password" autocomplete="current-password" required autofocus>
<div class="actions"><button type="submit">Sign in</button></div>
</form>`);
}

function renderConsent(req, res, client, nonce, redirectUri) {
    const redirectHost = new URL(redirectUri).host;
    renderPage(res, 200, 'Allow access', `
<h1>Allow access?</h1>
<p><strong>${escapeHtml(client.client_name || 'An unnamed app')}</strong> (via ${escapeHtml(redirectHost)}) is asking to
<strong>read and change</strong> your live MoneyWise data: transactions, envelopes and icons.</p>
<p class="note">Only allow this if you started connecting MoneyWise from your own Claude account just now.
You can revoke access any time in MoneyWise → Configuration → Settings.</p>
<form method="post" action="/authorize">
${hiddenFields(req)}
<input type="hidden" name="consent_nonce" value="${escapeHtml(nonce)}">
<div class="actions">
  <button type="submit" name="decision" value="deny" class="secondary">Deny</button>
  <button type="submit" name="decision" value="allow">Allow</button>
</div>
</form>`);
}

// ==================== PROVIDER ====================

const provider = {
    clientsStore,

    async authorize(client, params, res) {
        const req = res.req;
        const body = req.method === 'POST' ? req.body : {};
        const clientName = client.client_name || 'unnamed';

        if (params.resource && !sameResource(params.resource.href, MCP_RESOURCE)) {
            throw new InvalidTargetError(`Unknown resource ${params.resource.href}`);
        }

        // Step 3: consent screen submitted
        if (typeof body.consent_nonce === 'string') {
            const nonceHash = hash(body.consent_nonce);
            const consent = db.prepare('SELECT * FROM oauth_consents WHERE nonce_hash = ?').get(nonceHash);
            db.prepare('DELETE FROM oauth_consents WHERE nonce_hash = ?').run(nonceHash);
            const valid = consent
                && consent.expires_at > Date.now()
                && consent.client_id === client.client_id
                && consent.code_challenge === params.codeChallenge
                && consent.redirect_uri === params.redirectUri;
            if (!valid) {
                return renderLogin(req, res, client, { status: 400, error: 'That sign-in expired. Please sign in again.' });
            }
            if (body.decision !== 'allow') {
                console.log(`[oauth] consent denied for "${clientName}"`);
                throw new AccessDeniedError('The user denied access');
            }

            const code = randomToken('mwc_');
            db.prepare(`
                INSERT INTO oauth_codes (code_hash, client_id, grant_id, code_challenge, redirect_uri, resource, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(hash(code), client.client_id, crypto.randomUUID(), params.codeChallenge,
                params.redirectUri, MCP_RESOURCE, Date.now() + CODE_TTL_MS);
            console.log(`[oauth] consent granted to "${clientName}"`);

            const target = new URL(params.redirectUri);
            target.searchParams.set('code', code);
            if (params.state) target.searchParams.set('state', params.state);
            return res.redirect(302, target.href);
        }

        // Step 2: password submitted
        if (typeof body.password === 'string') {
            if (loginBlocked(req.ip)) {
                console.warn(`[oauth] login blocked (too many failures) for "${clientName}" from ${req.ip}`);
                return renderLogin(req, res, client, { status: 429, error: 'Too many failed attempts. Try again in 15 minutes.' });
            }
            if (!verifyPassword(body.password)) {
                recordFailure(req.ip);
                console.warn(`[oauth] login FAILED for "${clientName}" from ${req.ip}`);
                return renderLogin(req, res, client, { status: 401, error: 'Incorrect password.' });
            }
            console.log(`[oauth] login ok for "${clientName}" from ${req.ip}`);

            const nonce = crypto.randomBytes(32).toString('base64url');
            db.prepare(`
                INSERT INTO oauth_consents (nonce_hash, client_id, code_challenge, redirect_uri, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(hash(nonce), client.client_id, params.codeChallenge, params.redirectUri, Date.now() + CONSENT_TTL_MS);
            return renderConsent(req, res, client, nonce, params.redirectUri);
        }

        // Step 1: first visit
        renderLogin(req, res, client);
    },

    // The SDK checks PKCE with this before exchangeAuthorizationCode
    async challengeForAuthorizationCode(client, code) {
        const row = db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?').get(hash(code));
        if (!row || row.client_id !== client.client_id || row.expires_at < Date.now()) {
            throw new InvalidGrantError('Invalid or expired authorization code');
        }
        return row.code_challenge;
    },

    async exchangeAuthorizationCode(client, code, _codeVerifier, redirectUri) {
        const codeHash = hash(code);
        const row = db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?').get(codeHash);
        if (!row || row.client_id !== client.client_id || row.expires_at < Date.now()) {
            throw new InvalidGrantError('Invalid or expired authorization code');
        }
        if (redirectUri !== undefined && redirectUri !== row.redirect_uri) {
            throw new InvalidGrantError('redirect_uri does not match the authorization request');
        }
        const claimed = db.prepare('UPDATE oauth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL')
            .run(Date.now(), codeHash);
        if (claimed.changes !== 1) {
            // A replayed code: also revoke whatever the first use obtained
            revokeGrant(row.grant_id);
            console.warn(`[oauth] authorization code reused for client ${client.client_id}; grant revoked`);
            throw new InvalidGrantError('Authorization code already used');
        }
        return issueTokens(client.client_id, row.grant_id, row.resource);
    },

    async exchangeRefreshToken(client, refreshToken) {
        const tokenHash = hash(refreshToken);
        return db.transaction(() => {
            const row = db.prepare(`SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'`).get(tokenHash);
            if (!row || row.client_id !== client.client_id || row.revoked_at || row.expires_at < Date.now()) {
                throw new InvalidGrantError('Invalid or expired refresh token');
            }
            db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE token_hash = ?').run(Date.now(), tokenHash);
            return issueTokens(client.client_id, row.grant_id, row.resource);
        })();
    },

    async verifyAccessToken(token) {
        const row = db.prepare(`SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = 'access'`).get(hash(token));
        if (!row || row.revoked_at || row.expires_at < Date.now()) {
            throw new InvalidTokenError('Invalid or expired access token');
        }
        return {
            token,
            clientId: row.client_id,
            scopes: [],
            expiresAt: Math.floor(row.expires_at / 1000), // seconds, as the SDK expects
            resource: new URL(row.resource),
        };
    },

    // RFC 7009: revoking either token ends the whole grant
    async revokeToken(client, { token }) {
        const row = db.prepare('SELECT grant_id, client_id FROM oauth_tokens WHERE token_hash = ?').get(hash(token));
        if (row && row.client_id === client.client_id) {
            revokeGrant(row.grant_id);
            console.log(`[oauth] grant revoked by client ${client.client_id}`);
        }
    },
};

// ==================== ROUTERS ====================

/** Metadata, /register, /authorize, /token, /revoke. Mount at the app root. */
export function createOAuthRouter() {
    const origin = new URL(publicOrigin());
    return mcpAuthRouter({
        provider,
        issuerUrl: origin,
        resourceServerUrl: new URL(MCP_RESOURCE),
        resourceName: 'MoneyWise',
        // Registered clients never expire mid-trip (the SDK default is 30 days)
        clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
    });
}

/** Accepts a valid OAuth access token on /mcp, or answers 401 with the discovery header. */
export const requireOAuthToken = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(MCP_RESOURCE)),
    expectedResource: new URL(MCP_RESOURCE),
});

/** GET /api/oauth/connections and POST /api/oauth/revoke-all, behind the web app's session auth. */
export const oauthAdminRouter = express.Router();

oauthAdminRouter.get('/connections', (req, res) => {
    try {
        res.json({ enabled: oauthEnabled(), connections: listOAuthConnections() });
    } catch (error) {
        console.error('[oauth] list connections failed:', error);
        res.status(500).json({ error: 'Failed to load connections' });
    }
});

oauthAdminRouter.post('/revoke-all', (req, res) => {
    try {
        const revoked = revokeAllOAuth();
        res.json({ success: true, revoked });
    } catch (error) {
        console.error('[oauth] revoke-all failed:', error);
        res.status(500).json({ error: 'Failed to revoke access' });
    }
});
