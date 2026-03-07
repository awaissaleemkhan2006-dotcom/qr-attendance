/**
 * QR Code Generator — Creates signed QR payloads with dynamic nonces
 * 
 * QR Payload Structure:
 * {
 *   session_id: UUID,
 *   course_id: UUID,
 *   timestamp: Unix timestamp (seconds),
 *   nonce: 64-char hex string (32 bytes entropy),
 *   signature: HMAC-SHA256(session_id|course_id|timestamp|nonce, SECRET)
 * }
 */
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('./config');
const { generateNonce } = require('./nonceService');

/**
 * Generate an HMAC-SHA256 signature for a QR payload
 * @param {string} sessionId
 * @param {string} courseId
 * @param {number} timestamp
 * @param {string} nonce
 * @returns {string} hex signature
 */
function signPayload(sessionId, courseId, timestamp, nonce) {
    const message = `${sessionId}|${courseId}|${timestamp}|${nonce}`;
    return crypto
        .createHmac('sha256', config.qrHmacSecret)
        .update(message)
        .digest('hex');
}

/**
 * Generate a complete QR code with signed payload
 * @param {string} sessionId
 * @param {string} courseId
 * @returns {Promise<{qrDataUrl: string, payload: object}>}
 */
async function generateQRCode(sessionId, courseId) {
    const timestamp = Date.now() / 1000; // Unix timestamp in seconds
    const nonce = generateNonce();
    const signature = signPayload(sessionId, courseId, timestamp, nonce);

    const payload = {
        session_id: sessionId,
        course_id: courseId,
        timestamp,
        nonce,
        signature,
    };

    // Generate QR as base64 data URL
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
        width: 400,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
    });

    return { qrDataUrl, payload };
}

module.exports = { generateQRCode, signPayload };
