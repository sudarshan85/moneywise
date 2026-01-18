import { getSession, SESSION_DURATION_MS } from '../routes/auth.js';

/**
 * Middleware to protect API routes requiring authentication.
 * Skips auth check for /api/auth/* endpoints and /api/health.
 * If no password is configured (MONEYWISE_PASSWORD not set), skips auth entirely.
 */
export function requireAuth(req, res, next) {
    // Skip auth for auth routes and health check
    if (req.path.startsWith('/api/auth') || req.path === '/api/health') {
        return next();
    }

    // If no password configured, skip auth (for local dev)
    if (!process.env.MONEYWISE_PASSWORD) {
        return next();
    }

    const token = req.cookies?.moneywise_session;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const session = getSession(token);

    if (!session) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    // Check if session has expired
    if (Date.now() > session.expires_at) {
        return res.status(401).json({ error: 'Session expired' });
    }

    next();
}
