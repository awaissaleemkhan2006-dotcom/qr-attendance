/**
 * WebSocket Handler — Real-time QR code push to teacher's browser
 * 
 * Protocol:
 * - Client connects with: ws://host:3000?sessionId=<UUID>
 * - Server pushes new QR data every 10 seconds:
 *   { type: 'qr_update', qrDataUrl: '...', payload: {...}, refreshIn: 10 }
 * - On session lock: { type: 'session_locked' }
 */
const WebSocket = require('ws');
const url = require('url');

// sessionId -> Set<WebSocket clients>
const sessionClients = new Map();

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        const params = new url.URL(req.url, 'http://localhost').searchParams;
        const sessionId = params.get('sessionId');

        if (!sessionId) {
            ws.send(JSON.stringify({ type: 'error', message: 'sessionId is required' }));
            ws.close();
            return;
        }

        // Register client for this session
        if (!sessionClients.has(sessionId)) {
            sessionClients.set(sessionId, new Set());
        }
        sessionClients.get(sessionId).add(ws);

        console.log(`WebSocket client connected for session ${sessionId}`);

        // Send current QR immediately
        const { activeQRData } = require('./sessionManager');
        const currentQR = activeQRData.get(sessionId);
        if (currentQR) {
            ws.send(JSON.stringify({
                type: 'qr_update',
                qrDataUrl: currentQR.qrDataUrl,
                payload: currentQR.payload,
                refreshIn: 10,
            }));
        }

        ws.on('close', () => {
            const clients = sessionClients.get(sessionId);
            if (clients) {
                clients.delete(ws);
                if (clients.size === 0) {
                    sessionClients.delete(sessionId);
                }
            }
            console.log(`WebSocket client disconnected from session ${sessionId}`);
        });

        ws.on('error', (err) => {
            console.error(`WebSocket error for session ${sessionId}:`, err.message);
        });
    });

    // Global broadcast function (called by sessionManager on QR refresh)
    global.broadcastQR = (sessionId, qrData) => {
        const clients = sessionClients.get(sessionId);
        if (!clients) return;

        const message = JSON.stringify({
            type: 'qr_update',
            qrDataUrl: qrData.qrDataUrl,
            payload: qrData.payload,
            refreshIn: 10,
        });

        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    };

    // Broadcast session lock
    global.broadcastSessionLock = (sessionId) => {
        const clients = sessionClients.get(sessionId);
        if (!clients) return;

        const message = JSON.stringify({ type: 'session_locked' });
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
                client.close();
            }
        });
        sessionClients.delete(sessionId);
    };

    return wss;
}

module.exports = { setupWebSocket };
