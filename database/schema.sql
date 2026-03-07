-- ============================================================
-- Secure QR-Based Attendance Management System
-- PostgreSQL Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id   VARCHAR(50) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
    device_id       VARCHAR(512) DEFAULT NULL,       -- Bound device fingerprint
    device_bound_at TIMESTAMPTZ DEFAULT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_university_id ON users(university_id);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- COURSES TABLE
-- ============================================================
CREATE TABLE courses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(20) UNIQUE NOT NULL,
    name        VARCHAR(150) NOT NULL,
    teacher_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_courses_teacher ON courses(teacher_id);

-- ============================================================
-- ENROLLMENTS TABLE
-- ============================================================
CREATE TABLE enrollments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, course_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);

-- ============================================================
-- SESSIONS TABLE
-- ============================================================
CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    is_locked   BOOLEAN DEFAULT FALSE,
    locked_at   TIMESTAMPTZ DEFAULT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_course ON sessions(course_id);
CREATE INDEX idx_sessions_teacher ON sessions(teacher_id);
CREATE INDEX idx_sessions_locked ON sessions(is_locked);

-- ============================================================
-- ATTENDANCE TABLE
-- ============================================================
CREATE TABLE attendance (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scanned_at  TIMESTAMPTZ DEFAULT NOW(),
    device_id   VARCHAR(512) NOT NULL,
    nonce_used  VARCHAR(128) NOT NULL,
    is_valid    BOOLEAN DEFAULT TRUE,
    UNIQUE(student_id, session_id)     -- One attendance per student per session
);

CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);

-- ============================================================
-- USED NONCES TABLE (Replay Attack Prevention)
-- ============================================================
CREATE TABLE used_nonces (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nonce       VARCHAR(128) UNIQUE NOT NULL,       -- Prevents reuse
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    used_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_used_nonces_nonce ON used_nonces(nonce);
CREATE INDEX idx_used_nonces_session ON used_nonces(session_id);
