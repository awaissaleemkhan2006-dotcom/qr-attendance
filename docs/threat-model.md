# Threat Model — Secure QR-Based Attendance Management System

## 1. System Overview

The system allows teachers to generate dynamic QR codes that students scan to mark attendance. Security controls prevent proxy attendance, replay attacks, and data tampering.

## 2. STRIDE Threat Analysis

### 2.1 Spoofing (Identity)

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| Credential theft | Brute-force password guessing | bcrypt password hashing with salt (cost factor 12) |
| Token forgery | Forge JWT without secret | HMAC-SHA256 signed JWTs with server-side secret |
| Impersonation | Share login credentials | Device binding — account locked to first device used |

### 2.2 Tampering (Data Integrity)

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| QR payload modification | Alter QR data before submission | HMAC-SHA256 signature on QR payload (session_id\|course_id\|timestamp\|nonce) |
| Attendance record modification | Direct DB manipulation after session | Record locking — session lock freezes all attendance records |
| API request manipulation | Modify request body in transit | Input validation on all endpoints; HTTPS recommended for production |

### 2.3 Repudiation

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| Deny attendance | Student claims they marked attendance | Complete audit trail with timestamps, device IDs, and nonces |
| Deny session creation | Teacher disputes session | Session records with teacher_id and timestamps |

### 2.4 Information Disclosure

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| Password exposure | Database breach | Passwords stored as bcrypt hashes only |
| Token leakage | XSS or man-in-the-middle | JWT expiry (24h); HTTPS in production |
| Student data exposure | Unauthorized API access | RBAC — students can't access teacher endpoints and vice versa |

### 2.5 Denial of Service

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| QR generation flood | Spam session creation | JWT-authenticated endpoints; teacher role required |
| Nonce table flooding | Submit many fake nonces | Nonce validation requires valid HMAC signature first |

### 2.6 Elevation of Privilege

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| Student acting as teacher | Modify role in request | Role stored server-side in DB; JWT contains role from server |
| Access other's records | IDOR attacks | All queries scoped to authenticated user's ID |

## 3. Attack-Specific Mitigations

### 3.1 Screenshot/Photo Sharing Attack
- **Attack**: Student shares QR screenshot with absent friend
- **Mitigation**: QR refreshes every 10 seconds with new nonce; nonce is single-use

### 3.2 Replay Attack
- **Attack**: Re-submit a previously captured QR payload
- **Mitigation**: `used_nonces` table tracks every nonce; 10-second timestamp window

### 3.3 Proxy Attendance (Device Sharing)
- **Attack**: One student scans on behalf of another on a different phone
- **Mitigation**: Device fingerprint bound on first scan; subsequent scans must match

### 3.4 Session Manipulation
- **Attack**: Mark attendance after teacher closes session
- **Mitigation**: `is_locked` flag on sessions; attendance endpoint rejects locked sessions

## 4. Trust Boundaries

```
┌─────────────────────────────────────────────┐
│  Browser (Untrusted)                        │
│  ├── Teacher Frontend                       │
│  └── Student Frontend                       │
├─────────────────────────────────────────────┤
│  API Layer (Semi-trusted)          HTTPS    │
│  ├── Flask API (Auth, Attendance)          │
│  └── Express API (QR, Sessions)            │
├─────────────────────────────────────────────┤
│  Database (Trusted)                         │
│  └── PostgreSQL                             │
└─────────────────────────────────────────────┘
```
