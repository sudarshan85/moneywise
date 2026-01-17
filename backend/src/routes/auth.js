import express from 'express';
import crypto from 'crypto';

const router = express.Router();

// Session storage (in-memory for simplicity)
// In production with multiple instances, use Redis or similar
const sessions = new Map();

// Session duration: 30 days
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
        sessions.set(token, { createdAt: Date.now() });

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
    sessions.set(token, { createdAt: Date.now() });

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
        sessions.delete(token);
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

    const session = sessions.get(token);

    if (!session) {
        return res.json({ authenticated: false, passwordRequired: true });
    }

    // Check if session has expired
    if (Date.now() - session.createdAt > SESSION_DURATION_MS) {
        sessions.delete(token);
        return res.json({ authenticated: false, passwordRequired: true });
    }

    res.json({ authenticated: true, passwordRequired: true });
});

// Export sessions map for middleware use
export { sessions, SESSION_DURATION_MS };
export default router;
