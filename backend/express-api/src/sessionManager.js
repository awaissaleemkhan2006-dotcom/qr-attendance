/**
 * Session Manager — Session lifecycle, QR refresh loop, record locking
 * Uses better-sqlite3 for SQLite support
 */
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const { generateQRCode } = require('./qrGenerator');

let db;
function getDb() {
    if (!db) {
        db = new Database(config.dbPath);
        db.pragma('journal_mode = WAL');
    }
    return db;
}

// Active QR refresh intervals: sessionId -> intervalId
const activeIntervals = new Map();

// Active QR data for WebSocket broadcast: sessionId -> { qrDataUrl, payload }
const activeQRData = new Map();

/**
 * Start a new attendance session
 */
async function startSession(courseId, teacherId) {
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    getDb().prepare(
        `INSERT INTO sessions (id, course_id, teacher_id, started_at, is_locked, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`
    ).run(sessionId, courseId, teacherId, now, now);

    // Generate initial QR code
    const qr = await generateQRCode(sessionId, courseId);
    activeQRData.set(sessionId, qr);

    // Start auto-refresh every 10 seconds
    const interval = setInterval(async () => {
        try {
            const newQr = await generateQRCode(sessionId, courseId);
            activeQRData.set(sessionId, newQr);

            if (global.broadcastQR) {
                global.broadcastQR(sessionId, newQr);
            }
        } catch (err) {
            console.error(`QR refresh error for session ${sessionId}:`, err);
        }
    }, config.qrWindowSeconds * 1000);

    activeIntervals.set(sessionId, interval);

    return {
        id: sessionId,
        course_id: courseId,
        teacher_id: teacherId,
        started_at: now,
        is_locked: false,
        qr: qr,
    };
}

/**
 * Stop/lock a session
 */
async function stopSession(sessionId, teacherId) {
    const session = getDb().prepare(
        'SELECT * FROM sessions WHERE id = ? AND teacher_id = ?'
    ).get(sessionId, teacherId);

    if (!session) {
        throw new Error('Session not found or access denied');
    }

    if (session.is_locked) {
        throw new Error('Session is already locked');
    }

    const now = new Date().toISOString();
    getDb().prepare(
        'UPDATE sessions SET is_locked = 1, locked_at = ? WHERE id = ?'
    ).run(now, sessionId);

    // Stop QR refresh
    if (activeIntervals.has(sessionId)) {
        clearInterval(activeIntervals.get(sessionId));
        activeIntervals.delete(sessionId);
    }
    activeQRData.delete(sessionId);

    // Get final attendance count
    const countRow = getDb().prepare(
        'SELECT COUNT(*) as count FROM attendance WHERE session_id = ?'
    ).get(sessionId);

    return {
        id: sessionId,
        is_locked: true,
        locked_at: now,
        total_attendance: countRow ? countRow.count : 0,
    };
}

/**
 * Get current QR data for a session
 */
function getCurrentQR(sessionId) {
    return activeQRData.get(sessionId) || null;
}

/**
 * Get session details
 */
async function getSession(sessionId) {
    return getDb().prepare(
        `SELECT s.*, c.code as course_code, c.name as course_name
         FROM sessions s
         JOIN courses c ON s.course_id = c.id
         WHERE s.id = ?`
    ).get(sessionId) || null;
}

/**
 * Get attendance for a session
 */
async function getSessionAttendance(sessionId) {
    return getDb().prepare(
        `SELECT a.*, u.name as student_name, u.university_id as student_university_id
         FROM attendance a
         JOIN users u ON a.student_id = u.id
         WHERE a.session_id = ?
         ORDER BY a.scanned_at ASC`
    ).all(sessionId);
}

module.exports = {
    startSession,
    stopSession,
    getCurrentQR,
    getSession,
    getSessionAttendance,
    activeQRData,
};
