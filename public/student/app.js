/**
 * Student Interface — Application Logic (Vercel-compatible)
 * Handles: Login, Registration, QR Scanning, Device Fingerprinting, Attendance
 */

// ─── Configuration ────────────────────────────────────────────
const API_BASE = '/api';  // Single unified API

// ─── State ────────────────────────────────────────────────────
let authToken = localStorage.getItem('student_token');
let currentUser = JSON.parse(localStorage.getItem('student_user') || 'null');
let html5QrScanner = null;
let isScanning = false;

// ─── DOM Helpers ──────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Device Fingerprinting ────────────────────────────────────
function generateDeviceFingerprint() {
    const components = [];

    // User Agent
    components.push(navigator.userAgent);

    // Screen info
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

    // Timezone
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Language
    components.push(navigator.language);

    // Platform
    components.push(navigator.platform || 'unknown');

    // Hardware concurrency
    components.push(String(navigator.hardwareConcurrency || 0));

    // Canvas fingerprint
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 200;
        canvas.height = 50;
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('QR-Attendance-FP', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('Device-Binding', 4, 17);
        components.push(canvas.toDataURL());
    } catch (e) {
        components.push('canvas-not-available');
    }

    // WebGL renderer
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) {
                components.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
                components.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
            }
        }
    } catch (e) {
        components.push('webgl-not-available');
    }

    // Hash it all
    const raw = components.join('|||');
    return sha256(raw);
}

// Simple SHA-256 implementation for fingerprinting
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (authToken && currentUser && currentUser.role === 'student') {
        showDashboard();
    } else {
        showScreen('login-screen');
    }

    setupEventListeners();
});

// ─── Event Listeners ──────────────────────────────────────────
function setupEventListeners() {
    // Auth
    $('#login-form').addEventListener('submit', handleLogin);
    $('#register-form').addEventListener('submit', handleRegister);
    $('#show-register').addEventListener('click', () => {
        $('#login-tab').classList.add('hidden');
        $('#register-tab').classList.remove('hidden');
    });
    $('#show-login').addEventListener('click', () => {
        $('#register-tab').classList.add('hidden');
        $('#login-tab').classList.remove('hidden');
    });

    // Logout
    $('#logout-btn').addEventListener('click', handleLogout);

    // Scanner
    $('#open-scanner').addEventListener('click', () => showScreen('scanner-screen'));
    $('#start-scan-btn').addEventListener('click', startScanner);
    $('#stop-scan-btn').addEventListener('click', stopScanner);
    $('#manual-submit-btn').addEventListener('click', handleManualSubmit);

    // History
    $('#view-history-btn').addEventListener('click', () => {
        showScreen('history-screen');
        loadFullHistory();
    });

    // Back buttons
    $('#back-to-dashboard').addEventListener('click', () => {
        stopScanner();
        showDashboard();
    });
    $('#history-back').addEventListener('click', () => showDashboard());
}

// ─── Screen Management ────────────────────────────────────────
function showScreen(screenId) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${screenId}`).classList.add('active');
}

// ─── Authentication ───────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const id = $('#login-id').value.trim();
    const password = $('#login-password').value;

    const btn = $('#login-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Signing in...';

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ university_id: id, password })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        if (data.user.role !== 'student') {
            throw new Error('This portal is for students only. Teachers use the teacher portal.');
        }

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('student_token', authToken);
        localStorage.setItem('student_user', JSON.stringify(currentUser));

        showDashboard();

    } catch (err) {
        const errEl = $('#auth-error');
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Sign In';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = $('#register-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Creating account...';

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: $('#reg-name').value.trim(),
                university_id: $('#reg-id').value.trim(),
                email: $('#reg-email').value.trim(),
                password: $('#reg-password').value,
                role: 'student',
                class_batch: $('#reg-batch')?.value?.trim() || null,
                semester: $('#reg-semester')?.value?.trim() || null,
                program: $('#reg-program')?.value?.trim() || null,
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');

        showToast('Account created! Please sign in.', 'success');

        // Switch to login tab
        $('#register-tab').classList.add('hidden');
        $('#login-tab').classList.remove('hidden');

    } catch (err) {
        const errEl = $('#auth-error');
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Create Account';
    }
}

function handleLogout() {
    stopScanner();
    authToken = null;
    currentUser = null;
    localStorage.removeItem('student_token');
    localStorage.removeItem('student_user');
    showScreen('login-screen');
}

// ─── Dashboard ────────────────────────────────────────────────
async function showDashboard() {
    showScreen('dashboard-screen');
    $('#nav-user-name').textContent = currentUser?.name || 'Student';

    // Show device binding notice
    if (currentUser?.device_bound) {
        $('#device-notice').classList.remove('hidden');
    }

    await Promise.all([loadCourses(), loadRecentAttendance()]);
}

async function loadCourses() {
    try {
        const res = await fetch(`${API_BASE}/attendance/courses`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const courses = data.courses || [];
        const grid = $('#courses-list');

        if (courses.length === 0) {
            grid.innerHTML = '<div class="empty-state">You are not enrolled in any courses yet.</div>';
            return;
        }

        grid.innerHTML = courses.map(c => `
            <div class="course-card">
                <span class="course-code">${escapeHtml(c.code)}</span>
                <div class="course-name">${escapeHtml(c.name)}</div>
                <div class="course-teacher">Taught by ${escapeHtml(c.teacher_name || 'Unknown')}</div>
            </div>
        `).join('');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadRecentAttendance() {
    try {
        const res = await fetch(`${API_BASE}/attendance/history`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const records = (data.attendance || []).slice(-10).reverse();
        renderAttendanceTable(records, '#recent-attendance');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadFullHistory() {
    try {
        const res = await fetch(`${API_BASE}/attendance/history`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const records = (data.attendance || []).reverse();
        renderAttendanceTable(records, '#full-history');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderAttendanceTable(records, containerId) {
    const container = $(containerId);

    if (records.length === 0) {
        container.innerHTML = '<div class="empty-state">No attendance records yet.</div>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${records.map(r => `
                    <tr>
                        <td>${formatDate(r.scanned_at)}</td>
                        <td>${formatTime(r.scanned_at)}</td>
                        <td><span class="badge badge-valid">✓ Present</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ─── QR Scanner ───────────────────────────────────────────────
function startScanner() {
    if (isScanning) return;

    const scanResult = $('#scan-result');
    scanResult.classList.add('hidden');

    html5QrScanner = new Html5Qrcode('scanner-viewfinder');

    html5QrScanner.start(
        { facingMode: 'environment' },
        {
            fps: 10,
            qrbox: { width: 250, height: 250 },
        },
        onScanSuccess,
        onScanFailure
    ).then(() => {
        isScanning = true;
        $('#start-scan-btn').classList.add('hidden');
        $('#stop-scan-btn').classList.remove('hidden');
        $('#scanner-placeholder').classList.add('hidden');
    }).catch(err => {
        showToast('Camera access denied or not available: ' + err, 'error');
    });
}

function stopScanner() {
    if (html5QrScanner && isScanning) {
        html5QrScanner.stop().then(() => {
            isScanning = false;
            $('#start-scan-btn').classList.remove('hidden');
            $('#stop-scan-btn').classList.add('hidden');
        }).catch(() => {
            isScanning = false;
        });
    }
}

async function onScanSuccess(decodedText) {
    // Stop scanner after successful read
    stopScanner();

    try {
        const qrData = JSON.parse(decodedText);
        await submitAttendance(qrData);
    } catch (err) {
        showScanResult('error', 'Invalid QR code format. Please try again.');
    }
}

function onScanFailure(error) {
    // Ignore continuous scan failures (expected when no QR is in frame)
}

// ─── Manual Submit ────────────────────────────────────────────
async function handleManualSubmit() {
    const raw = $('#manual-qr-data').value.trim();
    if (!raw) {
        showToast('Please paste the QR data first.', 'error');
        return;
    }

    try {
        const qrData = JSON.parse(raw);
        await submitAttendance(qrData);
    } catch (err) {
        showToast('Invalid JSON format.', 'error');
    }
}

// ─── Submit Attendance ────────────────────────────────────────
async function submitAttendance(qrData) {
    const scanResult = $('#scan-result');
    scanResult.classList.add('hidden');

    try {
        // Generate device fingerprint
        const fingerprint = await generateDeviceFingerprint();

        const res = await fetch(`${API_BASE}/attendance/mark`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'X-Device-Fingerprint': fingerprint
            },
            body: JSON.stringify({ qr_data: qrData })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || data.message || 'Failed to mark attendance');
        }

        showScanResult('success', `✅ ${data.message}${data.device_status ? ` (${data.device_status})` : ''}`);
        showToast('Attendance marked successfully!', 'success');

        // Refresh dashboard data
        loadRecentAttendance();

        // Update device binding status
        if (data.device_status && data.device_status.includes('bound')) {
            currentUser.device_bound = true;
            localStorage.setItem('student_user', JSON.stringify(currentUser));
        }

    } catch (err) {
        showScanResult('error', `❌ ${err.message}`);
        showToast(err.message, 'error');
    }
}

function showScanResult(type, message) {
    const result = $('#scan-result');
    result.className = `scan-result ${type}`;
    result.querySelector('.scan-result-text').textContent = message;
    result.querySelector('.scan-result-icon').textContent = type === 'success' ? '✅' : '❌';
    result.classList.remove('hidden');
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('hidden'), 4000);
}

// ─── Utilities ────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
