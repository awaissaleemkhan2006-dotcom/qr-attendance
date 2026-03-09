/**
 * Admin Portal — Application Logic
 * Hardcoded login: AZK / epstein
 * Uses /api/auth/register to create teacher accounts
 */

const API_BASE = '/api';
const ADMIN_USER = 'AZK';
const ADMIN_PASS = 'epstein';

// ─── State ──────────────────────────────────────────────────
let isLoggedIn = sessionStorage.getItem('admin_auth') === 'true';

// ─── DOM ────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);

// ─── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn) {
        showDashboard();
    } else {
        showScreen('login-screen');
    }

    $('#login-form').addEventListener('submit', handleLogin);
    $('#register-form').addEventListener('submit', handleRegister);
    $('#logout-btn').addEventListener('click', handleLogout);
    $('#refresh-btn').addEventListener('click', loadTeachers);
});

// ─── Screens ────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function showDashboard() {
    showScreen('dashboard-screen');
    loadTeachers();
}

// ─── Auth ────────────────────────────────────────────────────
function handleLogin(e) {
    e.preventDefault();
    const user = $('#login-user').value.trim();
    const pass = $('#login-pass').value;

    const btn = $('#login-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Verifying...';

    setTimeout(() => {
        if (user === ADMIN_USER && pass === ADMIN_PASS) {
            sessionStorage.setItem('admin_auth', 'true');
            isLoggedIn = true;
            showDashboard();
        } else {
            const err = $('#login-error');
            err.textContent = 'Invalid credentials. Access denied.';
            err.classList.remove('hidden');
            // Shake animation
            $('#login-form').style.animation = 'none';
            setTimeout(() => { $('#login-form').style.animation = ''; }, 10);
        }
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Access Panel';
    }, 600);
}

function handleLogout() {
    sessionStorage.removeItem('admin_auth');
    isLoggedIn = false;
    showScreen('login-screen');
    $('#login-user').value = '';
    $('#login-pass').value = '';
    $('#login-error').classList.add('hidden');
}

// ─── Register Teacher ────────────────────────────────────────
async function handleRegister(e) {
    e.preventDefault();
    const btn = $('#register-btn');
    const msg = $('#register-msg');
    msg.classList.add('hidden');
    msg.className = 'msg hidden';

    btn.disabled = true;
    btn.querySelector('span').textContent = 'Registering...';

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: $('#t-name').value.trim(),
                university_id: $('#t-uid').value.trim(),
                email: $('#t-email').value.trim(),
                password: $('#t-pass').value,
                role: 'teacher'
            })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Registration failed');

        msg.textContent = `✓ Teacher "${data.user.name}" registered successfully!`;
        msg.className = 'msg';
        msg.classList.remove('hidden');

        showToast(`Teacher ${data.user.name} registered!`, 'success');
        $('#register-form').reset();
        loadTeachers();

    } catch (err) {
        msg.textContent = `✗ ${err.message}`;
        msg.className = 'msg error';
        msg.classList.remove('hidden');
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Register Teacher';
    }
}

// ─── Load Teachers ───────────────────────────────────────────
async function loadTeachers() {
    const list = $('#teachers-list');
    list.innerHTML = '<div class="empty-state">Loading...</div>';

    try {
        // Use a temporary admin token approach — we call /api/admin/teachers
        const res = await fetch(`${API_BASE}/admin/teachers`, {
            headers: { 'X-Admin-Key': 'AZK:epstein' }
        });

        if (!res.ok) {
            list.innerHTML = '<div class="empty-state">Could not load teachers.</div>';
            return;
        }

        const data = await res.json();
        const teachers = data.teachers || [];

        if (teachers.length === 0) {
            list.innerHTML = '<div class="empty-state">No teachers registered yet. Use the form to add one.</div>';
            return;
        }

        list.innerHTML = teachers.map(t => `
      <div class="teacher-item">
        <div class="teacher-avatar">${(t.name || '?')[0].toUpperCase()}</div>
        <div class="teacher-info">
          <div class="teacher-name">${escapeHtml(t.name)}</div>
          <div class="teacher-uid">ID: ${escapeHtml(t.university_id)}</div>
          <div class="teacher-email">${escapeHtml(t.email)}</div>
        </div>
        <span class="teacher-badge">Teacher</span>
      </div>
    `).join('');

    } catch (err) {
        list.innerHTML = '<div class="empty-state">Failed to load teachers.</div>';
    }
}

// ─── Utilities ────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('hidden'), 4000);
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
