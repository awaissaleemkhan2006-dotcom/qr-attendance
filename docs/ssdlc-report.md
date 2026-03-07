# SSDLC Report — Secure QR-Based Attendance Management System

## 1. Requirement Analysis

### Functional Requirements
- Teachers create attendance sessions that generate dynamic QR codes
- Students scan QR codes to mark attendance using university credentials
- System must prevent proxy attendance and replay attacks
- Records locked after session close

### Security Requirements
- All authentication via JWT with bcrypt password hashing
- QR codes contain HMAC-SHA256 signed payloads
- Device fingerprinting to prevent multi-device usage
- Role-Based Access Control (RBAC) for teacher/student separation
- Nonce-based replay attack prevention
- 10-second QR validity window

---

## 2. Threat Modeling

A complete STRIDE analysis was performed (see `threat-model.md`):

| Category | # Threats Identified | # Mitigated |
|----------|---------------------|-------------|
| Spoofing | 3 | 3 |
| Tampering | 3 | 3 |
| Repudiation | 2 | 2 |
| Information Disclosure | 3 | 3 |
| Denial of Service | 2 | 2 |
| Elevation of Privilege | 2 | 2 |

Key attack scenarios mitigated:
1. **Screenshot sharing** → 10s QR refresh + single-use nonces
2. **Replay attacks** → `used_nonces` table + timestamp window
3. **Proxy attendance** → Device fingerprint binding
4. **Post-session edits** → Record locking mechanism

---

## 3. Secure Design

### Architecture Decisions
- **Dual backend** (Flask + Express.js) for separation of concerns
- **PostgreSQL** with UUID primary keys and proper indexing
- **WebSocket** for real-time QR push (avoids client-side polling)
- **HMAC-SHA256** shared secret between Flask and Express for QR signature verification

### Security Controls Matrix

| Control | Layer | Implementation |
|---------|-------|---------------|
| Authentication | Application | JWT with 24h expiry |
| Password Storage | Data | bcrypt with salt |
| Authorization | Application | Role-based decorators |
| Input Validation | Application | Server-side field validation |
| Data Integrity | Application | HMAC-SHA256 QR signatures |
| Replay Prevention | Application | Single-use nonces + time window |
| Device Binding | Application | Browser fingerprint (canvas, WebGL, UA) |
| Record Integrity | Data | Session locking mechanism |

---

## 4. Secure Coding Practices

### Applied Practices
- **Parameterized queries** — SQLAlchemy ORM prevents SQL injection
- **Input validation** — All endpoints validate required fields
- **Error handling** — Generic error messages (no stack traces to client)
- **Secure password hashing** — bcrypt with automatic salt
- **Timing-safe comparison** — `hmac.compare_digest()` for signature verification
- **CORS configuration** — Restricted to API paths
- **Environment variables** — Secrets stored in `.env` files (not hardcoded)

### Code Review Checklist
- [x] No hardcoded secrets in source code
- [x] All database queries use ORM / parameterized statements
- [x] Authentication required on all sensitive endpoints
- [x] Role checks on every protected route
- [x] Timestamps use UTC consistently
- [x] Error responses don't leak internal details

---

## 5. Security Testing

### Test Categories

| Test | Method | Target |
|------|--------|--------|
| Expired QR rejection | Automated | `POST /api/attendance/mark` with old timestamp |
| Nonce reuse rejection | Automated | `POST /api/attendance/mark` with used nonce |
| Invalid signature rejection | Automated | `POST /api/attendance/mark` with tampered payload |
| Device mismatch rejection | Automated | Mark from different device fingerprint |
| Locked session rejection | Automated | Mark after `POST /api/sessions/stop` |
| RBAC enforcement | Automated | Student accessing teacher endpoints |
| Unauthenticated access | Automated | Requests without JWT |

### Testing Commands
```bash
# Flask API tests
cd backend/flask-api && python -m pytest tests/ -v

# Express API tests
cd backend/express-api && npm test
```

---

## 6. Deployment Considerations

### Production Checklist
- [ ] Enable HTTPS (TLS 1.3) on all endpoints
- [ ] Rotate JWT and HMAC secrets from development defaults
- [ ] Set `CORS` origins to specific frontend domains
- [ ] Enable PostgreSQL connection pooling and SSL
- [ ] Set up rate limiting on authentication endpoints
- [ ] Configure log aggregation for security event monitoring
- [ ] Run dependency vulnerability scans (`pip audit`, `npm audit`)
