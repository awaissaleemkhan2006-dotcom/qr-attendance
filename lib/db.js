/**
 * Database Layer — Turso (libSQL) Connection & Schema
 */
const { createClient } = require('@libsql/client');

let db;

function getDb() {
    if (!db) {
        db = createClient({
            url: process.env.TURSO_DATABASE_URL || 'file:local.db',
            authToken: process.env.TURSO_AUTH_TOKEN || undefined,
        });
    }
    return db;
}

async function initializeDatabase() {
    const client = getDb();

    await client.executeMultiple(`
        CREATE TABLE IF NOT EXISTS users (
            id              TEXT PRIMARY KEY,
            university_id   TEXT UNIQUE NOT NULL,
            name            TEXT NOT NULL,
            email           TEXT UNIQUE NOT NULL,
            password_hash   TEXT NOT NULL,
            role            TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
            device_id       TEXT DEFAULT NULL,
            device_bound_at TEXT DEFAULT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS courses (
            id          TEXT PRIMARY KEY,
            code        TEXT UNIQUE NOT NULL,
            name        TEXT NOT NULL,
            teacher_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS enrollments (
            id          TEXT PRIMARY KEY,
            student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            enrolled_at TEXT DEFAULT (datetime('now')),
            UNIQUE(student_id, course_id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            teacher_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            started_at  TEXT DEFAULT (datetime('now')),
            expires_at  TEXT,
            is_locked   INTEGER DEFAULT 0,
            locked_at   TEXT DEFAULT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id          TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scanned_at  TEXT DEFAULT (datetime('now')),
            device_id   TEXT NOT NULL,
            nonce_used  TEXT NOT NULL,
            is_valid    INTEGER DEFAULT 1,
            UNIQUE(student_id, session_id)
        );

        CREATE TABLE IF NOT EXISTS used_nonces (
            id          TEXT PRIMARY KEY,
            nonce       TEXT UNIQUE NOT NULL,
            session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            used_at     TEXT DEFAULT (datetime('now'))
        );
    `);

    console.log('Database tables initialized');
}

module.exports = { getDb, initializeDatabase };
