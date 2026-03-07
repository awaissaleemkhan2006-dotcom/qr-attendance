/**
 * Express.js API Configuration
 */
require('dotenv').config();
const path = require('path');

module.exports = {
    port: process.env.PORT || 3000,
    dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || '../flask-api/qr_attendance.db'),
    qrHmacSecret: process.env.QR_HMAC_SECRET || 'qr-hmac-shared-secret',
    qrWindowSeconds: parseInt(process.env.QR_WINDOW_SECONDS || '10', 10),
    jwtSecret: process.env.JWT_SECRET || 'jwt-secret',
};
