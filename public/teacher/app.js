/**
 * Teacher Interface — Application Logic (Vercel-compatible)
 * Handles: Login, Dashboard, Session lifecycle, Polling-based QR refresh
 */

// ─── Configuration ────────────────────────────────────────────
const API_BASE = '/api';  // Single unified API

// ─── State ────────────────────────────────────────────────────
let authToken = localStorage.getItem('teacher_token');
let currentUser = JSON.parse(localStorage.getItem('teacher_user') || 'null');
let activeSessionId = null;
let timerInterval = null;
let pollInterval = null;
let qrPollInterval = null;

// ─── DOM Elements ─────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (authToken && currentUser && currentUser.role === 'teacher') {
        showDashboard();
    } else {
        showScreen('login-screen');
    }

    setupEventListeners();
});

// ─── Event Listeners ──────────────────────────────────────────
function setupEventListeners() {
    // Login
    $('#login-form').addEventListener('submit', handleLogin);

    // Logout
    $('#logout-btn').addEventListener('click', handleLogout);

    // Create Course
    $('#create-course-btn').addEventListener('click', () => openModal('create-course-modal'));
    $('#create-course-form').addEventListener('submit', handleCreateCourse);

    // Enroll Form
    $('#enroll-form').addEventListener('submit', handleEnrollStudent);

    // Back to dashboard
    $('#back-to-dashboard').addEventListener('click', () => showDashboard());

    // Stop session
    $('#stop-session-btn').addEventListener('click', handleStopSession);

    // Modal close buttons
    $$('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.dataset.modal);
        });
    });

    // Close modal on overlay click
    $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });
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

        if (data.user.role !== 'teacher') {
            throw new Error('This portal is for teachers only');
        }

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('teacher_token', authToken);
        localStorage.setItem('teacher_user', JSON.stringify(currentUser));

        showDashboard();

    } catch (err) {
        const errEl = $('#login-error');
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Sign In';
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('teacher_token');
    localStorage.removeItem('teacher_user');
    stopAllPolling();
    showScreen('login-screen');
}

// ─── Dashboard ────────────────────────────────────────────────
async function showDashboard() {
    showScreen('dashboard-screen');
    $('#nav-user-name').textContent = currentUser?.name || 'Teacher';

    // Stop any active session polling
    stopAllPolling();

    await Promise.all([loadCourses(), loadSessions()]);
}

async function loadCourses() {
    try {
        const res = await fetch(`${API_BASE}/attendance/teacher/courses`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        const courses = data.courses || [];
        $('#stat-courses').textContent = courses.length;

        const grid = $('#courses-list');
        if (courses.length === 0) {
            grid.innerHTML = '<div class="empty-state">No courses yet. Create one to get started.</div>';
            return;
        }

        grid.innerHTML = courses.map(c => `
            <div class="course-card">
                <div class="course-card-header">
                    <span class="course-code">${escapeHtml(c.code)}</span>
                    <div class="course-name">${escapeHtml(c.name)}</div>
                </div>
                <div class="course-actions">
                    <button class="btn btn-primary btn-sm" onclick="startSession('${c.id}', '${escapeHtml(c.name)}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Start Session
                    </button>
                    <button class="btn btn-accent btn-sm" onclick="openEnrollModal('${c.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
                        Enroll
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadSessions() {
    try {
        const res = await fetch(`${API_BASE}/attendance/teacher/sessions`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        const sessions = data.sessions || [];
        $('#stat-sessions').textContent = sessions.length;
        $('#stat-active').textContent = sessions.filter(s => !s.is_locked).length;

        const container = $('#sessions-list');
        if (sessions.length === 0) {
            container.innerHTML = '<div class="empty-state">No sessions yet.</div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Course</th>
                        <th>Started</th>
                        <th>Status</th>
                        <th>Attendance</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${sessions.map(s => `
                        <tr>
                            <td>${escapeHtml(s.course_code || '')} — ${escapeHtml(s.course_name || '')}</td>
                            <td>${formatDate(s.started_at)}</td>
                            <td>
                                ${s.is_locked
                ? '<span class="badge badge-locked">Locked</span>'
                : '<span class="badge badge-active"><span class="pulse-dot"></span> Active</span>'}
                            </td>
                            <td>${s.attendance_count}</td>
                            <td>
                                <button class="btn btn-ghost btn-sm" onclick="viewSessionAttendance('${s.id}', '${escapeHtml(s.course_name || '')}')">
                                    View
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Course Management ────────────────────────────────────────
async function handleCreateCourse(e) {
    e.preventDefault();
    const code = $('#course-code').value.trim();
    const name = $('#course-name').value.trim();

    try {
        const res = await fetch(`${API_BASE}/attendance/teacher/courses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ code, name })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast('Course created successfully!', 'success');
        closeModal('create-course-modal');
        $('#create-course-form').reset();
        loadCourses();

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Student Enrollment ───────────────────────────────────────
function openEnrollModal(courseId) {
    $('#enroll-course-id').value = courseId;
    openModal('enroll-modal');
}

async function handleEnrollStudent(e) {
    e.preventDefault();
    const courseId = $('#enroll-course-id').value;
    const studentId = $('#enroll-student-id').value.trim();

    try {
        const res = await fetch(`${API_BASE}/attendance/teacher/enroll`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                student_university_id: studentId,
                course_id: courseId
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast('Student enrolled successfully!', 'success');
        closeModal('enroll-modal');
        $('#enroll-form').reset();

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Session Management ───────────────────────────────────────
async function startSession(courseId, courseName) {
    try {
        const res = await fetch(`${API_BASE}/sessions/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ course_id: courseId })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        activeSessionId = data.session.id;

        // Show session screen
        showScreen('session-screen');
        $('#session-course-name').textContent = courseName;
        $('#session-id-label').textContent = `Session: ${activeSessionId.substring(0, 8)}...`;

        // Display initial QR
        if (data.qr) {
            updateQRDisplay(data.qr.qrDataUrl);
        }

        // Start polling for QR refresh (replaces WebSocket)
        startQRPolling(activeSessionId);

        // Poll attendance
        startAttendancePolling(activeSessionId);

        showToast('Session started! QR code is now active.', 'success');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleStopSession() {
    if (!activeSessionId) return;

    if (!confirm('Are you sure you want to end this session? Attendance records will be locked.')) return;

    try {
        const res = await fetch(`${API_BASE}/sessions/stop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ session_id: activeSessionId })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        stopAllPolling();

        showToast(`Session ended. ${data.attendance_count || 0} students marked present.`, 'success');
        activeSessionId = null;
        showDashboard();

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── QR Polling (replaces WebSocket) ──────────────────────────
const QR_REFRESH_SECONDS = 10;

function startQRPolling(sessionId) {
    if (qrPollInterval) clearInterval(qrPollInterval);

    const fetchQR = async () => {
        try {
            const res = await fetch(`${API_BASE}/sessions/${sessionId}/qr`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            if (!res.ok) {
                if (res.status === 400) {
                    // Session locked
                    stopAllPolling();
                    showToast('Session has been locked.', 'error');
                    showDashboard();
                    return;
                }
                throw new Error('Failed to fetch QR');
            }

            const data = await res.json();
            updateQRDisplay(data.qr.qrDataUrl);
            startTimer(QR_REFRESH_SECONDS);
        } catch (err) {
            console.error('QR poll error:', err);
        }
    };

    fetchQR(); // Initial fetch
    qrPollInterval = setInterval(fetchQR, QR_REFRESH_SECONDS * 1000);
}

function stopAllPolling() {
    if (qrPollInterval) { clearInterval(qrPollInterval); qrPollInterval = null; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateQRDisplay(dataUrl) {
    const img = $('#qr-image');
    img.src = dataUrl;
    $('#qr-overlay').classList.add('hidden');
}

// ─── Timer ────────────────────────────────────────────────────
function startTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);

    let remaining = seconds;
    const fill = $('#timer-fill');
    const text = $('#timer-text');

    fill.style.width = '100%';
    text.textContent = `Refreshes in ${remaining}s`;

    timerInterval = setInterval(() => {
        remaining--;
        const percent = (remaining / seconds) * 100;
        fill.style.width = `${percent}%`;
        text.textContent = `Refreshes in ${remaining}s`;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            fill.style.width = '0%';
            text.textContent = 'Refreshing...';
        }
    }, 1000);
}

// ─── Attendance Polling ───────────────────────────────────────
function startAttendancePolling(sessionId) {
    if (pollInterval) clearInterval(pollInterval);

    const poll = async () => {
        try {
            const res = await fetch(`${API_BASE}/attendance/teacher/sessions/${sessionId}/attendance`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();

            if (res.ok) {
                updateAttendanceList(data.attendance || []);
            }
        } catch (err) {
            // Silently fail on poll errors
        }
    };

    poll(); // Initial poll
    pollInterval = setInterval(poll, 5000); // Poll every 5s
}

function updateAttendanceList(records) {
    const list = $('#live-attendance-list');
    const count = $('#live-count');

    count.textContent = records.length;

    if (records.length === 0) {
        list.innerHTML = '<div class="empty-state small">Waiting for students to scan...</div>';
        return;
    }

    list.innerHTML = records.map(r => `
        <div class="attendance-item">
            <div class="attendance-avatar">${(r.student_name || '?')[0].toUpperCase()}</div>
            <div class="attendance-info">
                <div class="attendance-name">${escapeHtml(r.student_name || 'Unknown')}</div>
                <div class="attendance-id">${escapeHtml(r.student_university_id || '')}</div>
            </div>
            <div class="attendance-time">${formatTime(r.scanned_at)}</div>
        </div>
    `).join('');
}

// ─── View Session Attendance ──────────────────────────────────
async function viewSessionAttendance(sessionId, courseName) {
    $('#attendance-modal-title').textContent = `Attendance — ${courseName}`;
    openModal('attendance-modal');

    try {
        const res = await fetch(`${API_BASE}/attendance/teacher/sessions/${sessionId}/attendance`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        const records = data.attendance || [];
        const content = $('#attendance-modal-content');

        if (records.length === 0) {
            content.innerHTML = '<div class="empty-state">No attendance records for this session.</div>';
            return;
        }

        content.innerHTML = records.map(r => `
            <div class="attendance-item">
                <div class="attendance-avatar">${(r.student_name || '?')[0].toUpperCase()}</div>
                <div class="attendance-info">
                    <div class="attendance-name">${escapeHtml(r.student_name || 'Unknown')}</div>
                    <div class="attendance-id">${escapeHtml(r.student_university_id || '')}</div>
                </div>
                <div class="attendance-time">${formatTime(r.scanned_at)}</div>
            </div>
        `).join('');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Modals ───────────────────────────────────────────────────
function openModal(id) {
    $(`#${id}`).classList.add('active');
}

function closeModal(id) {
    $(`#${id}`).classList.remove('active');
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}

// ─── Utilities ────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
