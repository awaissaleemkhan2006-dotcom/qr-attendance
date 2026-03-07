# Secure QR-Based Attendance Management System

A secure attendance management system using dynamically-refreshing QR codes to prevent proxy attendance and replay attacks, built with an SSDLC approach.

## Architecture

```
Frontend (HTML/CSS/JS)          Backend
┌──────────────────┐    ┌─────────────────────────┐
│  Teacher Portal   │───│  Express.js :3000        │
│  - Live QR Display│   │  - QR Generation (HMAC)  │
│  - Dashboard      │   │  - Session Management    │
│                   │   │  - WebSocket QR Push     │
├──────────────────┤    ├─────────────────────────┤
│  Student Portal   │───│  Flask :5000             │
│  - QR Scanner     │   │  - JWT Auth (bcrypt)     │
│  - Device Binding │   │  - Attendance Marking    │
│  - History        │   │  - RBAC                  │
└──────────────────┘    └──────────┬──────────────┘
                                   │
                        ┌──────────▼──────────────┐
                        │  PostgreSQL :5432        │
                        │  - Users, Courses        │
                        │  - Sessions, Attendance  │
                        │  - Used Nonces           │
                        └─────────────────────────┘
```

## Security Features

| Feature | Implementation |
|---------|---------------|
| Dynamic QR Codes | Refresh every 10s with new high-entropy nonce |
| Replay Prevention | Single-use nonces + 10s timestamp window |
| QR Integrity | HMAC-SHA256 signed payloads |
| Device Binding | Browser fingerprint locked on first scan |
| Authentication | JWT with bcrypt password hashing |
| Authorization | Role-Based Access Control (teacher/student) |
| Record Locking | Session lock freezes attendance records |

## Prerequisites

- **Python 3.10+** with pip
- **Node.js 18+** with npm
- **PostgreSQL 14+**

## Setup

### 1. Database

```bash
# Create database
psql -U postgres -c "CREATE DATABASE qr_attendance;"

# Run schema
psql -U postgres -d qr_attendance -f database/schema.sql
```

### 2. Flask API (Port 5000)

```bash
cd backend/flask-api

# Create virtual environment
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Configure .env (update DATABASE_URL, secrets)
# Then run:
python run.py
```

### 3. Express.js API (Port 3000)

```bash
cd backend/express-api

# Install dependencies
npm install

# Configure .env (must share QR_HMAC_SECRET and JWT_SECRET with Flask)
# Then run:
npm start
```

### 4. Frontend

Open the HTML files directly in a browser:
- **Teacher Portal**: `frontend/teacher/index.html`
- **Student Portal**: `frontend/student/index.html`

## Usage Flow

1. **Teacher** registers and logs in via Teacher Portal
2. Teacher creates a course and enrolls students
3. Teacher starts an attendance session → live QR code appears
4. QR code auto-refreshes every 10 seconds via WebSocket
5. **Student** logs in via Student Portal and opens QR scanner
6. Student scans the QR code → device fingerprint captured
7. Backend verifies: signature, timestamp, nonce, enrollment, device, session lock
8. Attendance marked ✓
9. Teacher stops session → records locked

## Documentation

- [Threat Model](docs/threat-model.md) — STRIDE analysis
- [SSDLC Report](docs/ssdlc-report.md) — Security lifecycle documentation

## Project Structure

```
├── backend/
│   ├── flask-api/          # Auth, Attendance, RBAC
│   │   ├── app/
│   │   │   ├── __init__.py # App factory
│   │   │   ├── auth.py     # JWT authentication
│   │   │   ├── routes.py   # Attendance endpoints
│   │   │   ├── models.py   # ORM models
│   │   │   ├── rbac.py     # Role-based access
│   │   │   └── device.py   # Device fingerprinting
│   │   └── run.py
│   └── express-api/        # QR, Sessions, WebSocket
│       └── src/
│           ├── server.js
│           ├── qrGenerator.js
│           ├── sessionManager.js
│           ├── nonceService.js
│           └── wsHandler.js
├── database/
│   └── schema.sql
├── frontend/
│   ├── teacher/            # Teacher dashboard & live QR
│   └── student/            # QR scanner & history
└── docs/
    ├── threat-model.md
    └── ssdlc-report.md
```
