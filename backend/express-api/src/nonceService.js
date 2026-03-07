/**
 * Nonce Service — Cryptographically secure nonce generation & reuse detection
 * Uses better-sqlite3 for SQLite support
 */
const crypto = require('crypto');
const Database = require('better-sqlite3');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');

let db;
function getDb() {
    if (!db) {
        db = new Database(config.dbPath);
        db.pragma('journal_mode = WAL');
    }
    return db;
}

/**
 * Generate a cryptographically secure high-entropy nonce
 * @returns {string} 64-character hex nonce (32 bytes of entropy)
 */
function generateNonce() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if a nonce has already been used
 * @param {string} nonce
 * @returns {boolean}
 */
function isNonceUsed(nonce) {
    const row = getDb().prepare('SELECT id FROM used_nonces WHERE nonce = ?').get(nonce);
    return !!row;
}

/**
 * Mark a nonce as used (prevents replay attacks)
 * @param {string} nonce
 * @param {string} sessionId
 */
function markNonceUsed(nonce, sessionId) {
    getDb().prepare(
        'INSERT INTO used_nonces (id, nonce, session_id, used_at) VALUES (?, ?, ?, datetime("now"))'
    ).run(uuidv4(), nonce, sessionId);
}

module.exports = { generateNonce, isNonceUsed, markNonceUsed };
