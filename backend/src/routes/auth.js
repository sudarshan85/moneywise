import express from 'express';
import crypto from 'crypto';
import db from '../db/database.js';

const router = express.Router();

// Session duration: 30 days (in milliseconds)
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Generate a secure session token
 */
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if password is configured
 */
function isPasswordConfigured() {
    return !!process.env.MONEYWISE_PASSWORD;
}

/**
 * Verify password matches configured password
 */
function verifyPassword(password) {
    const configuredPassword = process.env.MONEYWISE_PASSWORD;
    if (!configuredPassword) return false;
    // Use timing-safe comparison to prevent timing attacks
    const a = Buffer.from(password);
    const b = Buffer.from(configuredPassword);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * Create a session in the database
 */
function createSession(token) {
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION_MS;

    db.prepare(`
        INSERT INTO sessions (token, created_at, expires_at)
        VALUES (?, ?, ?)
    `).run(token, now, expiresAt);
}

/**
 * Get session from database
 */
function getSession(token) {
    return db.prepare(`
        SELECT * FROM sessions WHERE token = ?
    `).get(token);
}

/**
 * Delete session from database
 */
function deleteSession(token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions() {
    try {
        const now = Date.now();
        db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    } catch (error) {
        // Table may not exist yet during first startup
        if (!error.message.includes('no such table')) {
            console.error('Session cleanup error:', error.message);
        }
    }
}

// Clean up expired sessions periodically (not on startup - table may not exist yet)
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // Every hour

/**
 * POST /api/auth/login
 * Authenticate with password
 */
router.post('/login', (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }

    if (!isPasswordConfigured()) {
        // No password set - allow access (for local dev without password)
        const token = generateSessionToken();
        createSession(token);

        res.cookie('moneywise_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: SESSION_DURATION_MS
        });

        return res.json({ success: true, message: 'No password configured - access granted' });
    }

    if (!verifyPassword(password)) {
        return res.status(401).json({ error: 'Incorrect password' });
    }

    // Password correct - create session
    const token = generateSessionToken();
    createSession(token);

    res.cookie('moneywise_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_DURATION_MS
    });

    res.json({ success: true });
});

/**
 * POST /api/auth/logout
 * Clear session
 */
router.post('/logout', (req, res) => {
    const token = req.cookies?.moneywise_session;

    if (token) {
        deleteSession(token);
    }

    res.clearCookie('moneywise_session');
    res.json({ success: true });
});

/**
 * GET /api/auth/status
 * Check authentication status
 */
router.get('/status', (req, res) => {
    // If no password is configured, always return authenticated
    if (!isPasswordConfigured()) {
        return res.json({ authenticated: true, passwordRequired: false });
    }

    const token = req.cookies?.moneywise_session;

    if (!token) {
        return res.json({ authenticated: false, passwordRequired: true });
    }

    const session = getSession(token);

    if (!session) {
        return res.json({ authenticated: false, passwordRequired: true });
    }

    // Check if session has expired
    if (Date.now() > session.expires_at) {
        deleteSession(token);
        return res.json({ authenticated: false, passwordRequired: true });
    }

    res.json({ authenticated: true, passwordRequired: true });
});

// Export for middleware use
export { getSession, SESSION_DURATION_MS };
export default router;
