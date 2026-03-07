/**
 * Express.js Server — QR generation, session management, nonce service
 */
const express = require('express');
const cors = require('cors');
const http = require('http');
const config = require('./config');
const { setupWebSocket } = require('./wsHandler');
const sessionManager = require('./sessionManager');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ─── JWT Middleware for Express ────────────────────────────────
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication token required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        // Simple JWT decode (HS256) — shared secret with Flask
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Invalid token format');

        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

        // Verify signature
        const signInput = parts[0] + '.' + parts[1];
        const expectedSig = crypto
            .createHmac('sha256', config.jwtSecret)
            .update(signInput)
            .digest('base64url');

        if (expectedSig !== parts[2]) {
            return res.status(401).json({ error: 'Invalid token signature' });
        }

        // Check expiry
        if (payload.exp && payload.exp < Date.now() / 1000) {
            return res.status(401).json({ error: 'Token expired' });
        }

        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token', details: err.message });
    }
}

// ─── Role check middleware ─────────────────────────────────────
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
}

// ─── Routes ────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'express-qr-api' });
});

// Start session (Teacher only)
app.post('/api/sessions/start', verifyToken, requireRole('teacher'), async (req, res) => {
    try {
        const { course_id } = req.body;
        if (!course_id) {
            return res.status(400).json({ error: 'course_id is required' });
        }

        const session = await sessionManager.startSession(course_id, req.user.user_id);
        res.status(201).json({
            message: 'Session started — QR code is now active',
            session,
        });
    } catch (err) {
        console.error('Start session error:', err);
        res.status(500).json({ error: 'Failed to start session', details: err.message });
    }
});

// Stop/lock session (Teacher only)
app.post('/api/sessions/stop', verifyToken, requireRole('teacher'), async (req, res) => {
    try {
        const { session_id } = req.body;
        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        const result = await sessionManager.stopSession(session_id, req.user.user_id);

        // Broadcast session lock to WebSocket clients
        if (global.broadcastSessionLock) {
            global.broadcastSessionLock(session_id);
        }

        res.json({
            message: 'Session locked — no more attendance can be marked',
            session: result,
        });
    } catch (err) {
        console.error('Stop session error:', err);
        res.status(400).json({ error: err.message });
    }
});

// Get current QR for a session
app.get('/api/sessions/:id/qr', verifyToken, requireRole('teacher'), async (req, res) => {
    try {
        const qr = sessionManager.getCurrentQR(req.params.id);
        if (!qr) {
            return res.status(404).json({ error: 'No active QR for this session' });
        }
        res.json({ qr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get session details
app.get('/api/sessions/:id', verifyToken, async (req, res) => {
    try {
        const session = await sessionManager.getSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json({ session });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get session attendance
app.get('/api/sessions/:id/attendance', verifyToken, requireRole('teacher'), async (req, res) => {
    try {
        const attendance = await sessionManager.getSessionAttendance(req.params.id);
        res.json({ attendance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Start Server ──────────────────────────────────────────────
const server = http.createServer(app);
setupWebSocket(server);

server.listen(config.port, () => {
    console.log(`Express QR API running on port ${config.port}`);
    console.log(`WebSocket server ready for QR push`);
});

module.exports = app;
