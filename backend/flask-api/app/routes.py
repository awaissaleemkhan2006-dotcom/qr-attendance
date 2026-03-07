"""
Attendance Routes — The critical endpoint for marking attendance
Performs: JWT verification, QR signature check, time window, nonce reuse,
enrollment check, session lock check, device binding
"""
from flask import Blueprint, request, jsonify, current_app
from app import db
from app.models import User, Course, Enrollment, Session, Attendance, UsedNonce
from app.auth import token_required
from app.rbac import require_role
from app.device import generate_device_fingerprint, verify_device
from datetime import datetime, timezone
import hmac
import hashlib
import json

attendance_bp = Blueprint('attendance', __name__)


# ─── Mark Attendance (THE Critical Endpoint) ──────────────────
@attendance_bp.route('/mark', methods=['POST'])
@token_required
@require_role('student')
def mark_attendance(current_user):
    """
    Mark attendance by scanning a QR code.
    
    Expected JSON body:
    {
        "qr_data": {
            "session_id": "...",
            "course_id": "...",
            "timestamp": 1234567890.123,
            "nonce": "...",
            "signature": "..."
        }
    }
    """
    data = request.get_json()
    
    if not data or 'qr_data' not in data:
        return jsonify({'error': 'QR data is required'}), 400
    
    qr = data['qr_data']
    
    # Validate QR payload fields
    required_fields = ['session_id', 'course_id', 'timestamp', 'nonce', 'signature']
    for field in required_fields:
        if field not in qr:
            return jsonify({'error': f'Invalid QR code: missing {field}'}), 400
    
    # ── Step 1: Verify HMAC Signature ──────────────────────────
    secret = current_app.config['QR_HMAC_SECRET']
    message = f"{qr['session_id']}|{qr['course_id']}|{qr['timestamp']}|{qr['nonce']}"
    expected_sig = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(expected_sig, qr['signature']):
        return jsonify({'error': 'Invalid QR code: signature verification failed'}), 403
    
    # ── Step 2: Check Timestamp (10-second window) ─────────────
    qr_time = float(qr['timestamp'])
    now = datetime.now(timezone.utc).timestamp()
    window = current_app.config['QR_WINDOW_SECONDS']
    
    if abs(now - qr_time) > window:
        return jsonify({
            'error': 'QR code has expired',
            'message': f'QR codes are valid for {window} seconds only'
        }), 410
    
    # ── Step 3: Check Nonce Reuse ──────────────────────────────
    existing_nonce = UsedNonce.query.filter_by(nonce=qr['nonce']).first()
    if existing_nonce:
        return jsonify({
            'error': 'Replay attack detected',
            'message': 'This QR code has already been used'
        }), 409
    
    # ── Step 4: Check Session Exists & Not Locked ──────────────
    session = Session.query.get(qr['session_id'])
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    
    if session.is_locked:
        return jsonify({
            'error': 'Session is locked',
            'message': 'The teacher has closed this attendance session'
        }), 423
    
    # ── Step 5: Check Student Enrollment ───────────────────────
    enrollment = Enrollment.query.filter_by(
        student_id=current_user.id,
        course_id=qr['course_id']
    ).first()
    
    if not enrollment:
        return jsonify({
            'error': 'Not enrolled',
            'message': 'You are not enrolled in this course'
        }), 403
    
    # ── Step 6: Check Duplicate Attendance ─────────────────────
    existing_att = Attendance.query.filter_by(
        student_id=current_user.id,
        session_id=qr['session_id']
    ).first()
    
    if existing_att:
        return jsonify({
            'error': 'Already marked',
            'message': 'Your attendance for this session is already recorded'
        }), 409
    
    # ── Step 7: Device Verification / Binding ──────────────────
    device_id = generate_device_fingerprint()
    device_ok, device_msg = verify_device(current_user, device_id)
    
    if not device_ok:
        return jsonify({
            'error': 'Device mismatch',
            'message': device_msg
        }), 403
    
    # ── Step 8: Record Attendance & Mark Nonce as Used ─────────
    try:
        # Mark nonce as used
        used_nonce = UsedNonce(
            nonce=qr['nonce'],
            session_id=qr['session_id']
        )
        db.session.add(used_nonce)
        
        # Record attendance
        attendance = Attendance(
            session_id=qr['session_id'],
            student_id=current_user.id,
            device_id=device_id,
            nonce_used=qr['nonce'],
            is_valid=True
        )
        db.session.add(attendance)
        db.session.commit()
        
        return jsonify({
            'message': 'Attendance marked successfully',
            'device_status': device_msg,
            'attendance': attendance.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to record attendance', 'details': str(e)}), 500


# ─── Get Attendance History ────────────────────────────────────
@attendance_bp.route('/history', methods=['GET'])
@token_required
@require_role('student')
def get_history(current_user):
    """Get the authenticated student's attendance records."""
    records = Attendance.query.filter_by(student_id=current_user.id).all()
    return jsonify({
        'attendance': [r.to_dict() for r in records]
    }), 200


# ─── Get Courses (for enrolled students) ──────────────────────
@attendance_bp.route('/courses', methods=['GET'])
@token_required
@require_role('student')
def get_courses(current_user):
    """Get courses the student is enrolled in."""
    enrollments = Enrollment.query.filter_by(student_id=current_user.id).all()
    courses = [Course.query.get(e.course_id) for e in enrollments]
    return jsonify({
        'courses': [c.to_dict() for c in courses if c]
    }), 200


# ─── Teacher: Get Courses ─────────────────────────────────────
@attendance_bp.route('/teacher/courses', methods=['GET'])
@token_required
@require_role('teacher')
def get_teacher_courses(current_user):
    """Get courses taught by the authenticated teacher."""
    courses = Course.query.filter_by(teacher_id=current_user.id).all()
    return jsonify({
        'courses': [c.to_dict() for c in courses]
    }), 200


# ─── Teacher: Create Course ───────────────────────────────────
@attendance_bp.route('/teacher/courses', methods=['POST'])
@token_required
@require_role('teacher')
def create_course(current_user):
    """Create a new course."""
    data = request.get_json()
    
    if not data or not data.get('code') or not data.get('name'):
        return jsonify({'error': 'Course code and name are required'}), 400
    
    if Course.query.filter_by(code=data['code']).first():
        return jsonify({'error': 'Course code already exists'}), 409
    
    course = Course(
        code=data['code'],
        name=data['name'],
        teacher_id=current_user.id
    )
    db.session.add(course)
    db.session.commit()
    
    return jsonify({
        'message': 'Course created',
        'course': course.to_dict()
    }), 201


# ─── Teacher: Enroll Student ──────────────────────────────────
@attendance_bp.route('/teacher/enroll', methods=['POST'])
@token_required
@require_role('teacher')
def enroll_student(current_user):
    """Enroll a student in a course."""
    data = request.get_json()
    
    if not data or not data.get('student_university_id') or not data.get('course_id'):
        return jsonify({'error': 'student_university_id and course_id are required'}), 400
    
    # Verify teacher owns the course
    course = Course.query.get(data['course_id'])
    if not course or course.teacher_id != current_user.id:
        return jsonify({'error': 'Course not found or access denied'}), 404
    
    student = User.query.filter_by(
        university_id=data['student_university_id'],
        role='student'
    ).first()
    
    if not student:
        return jsonify({'error': 'Student not found'}), 404
    
    # Check if already enrolled
    existing = Enrollment.query.filter_by(
        student_id=student.id,
        course_id=course.id
    ).first()
    
    if existing:
        return jsonify({'error': 'Student is already enrolled'}), 409
    
    enrollment = Enrollment(
        student_id=student.id,
        course_id=course.id
    )
    db.session.add(enrollment)
    db.session.commit()
    
    return jsonify({
        'message': 'Student enrolled successfully',
        'enrollment': enrollment.to_dict()
    }), 201


# ─── Teacher: Get Session Attendance ──────────────────────────
@attendance_bp.route('/teacher/sessions/<session_id>/attendance', methods=['GET'])
@token_required
@require_role('teacher')
def get_session_attendance(current_user, session_id):
    """Get attendance records for a specific session."""
    session = Session.query.get(session_id)
    
    if not session or session.teacher_id != current_user.id:
        return jsonify({'error': 'Session not found or access denied'}), 404
    
    records = Attendance.query.filter_by(session_id=session_id).all()
    return jsonify({
        'session': session.to_dict(),
        'attendance': [r.to_dict() for r in records]
    }), 200


# ─── Teacher: Get Sessions ────────────────────────────────────
@attendance_bp.route('/teacher/sessions', methods=['GET'])
@token_required
@require_role('teacher')
def get_teacher_sessions(current_user):
    """Get all sessions for the teacher's courses."""
    sessions = Session.query.filter_by(teacher_id=current_user.id).order_by(
        Session.created_at.desc()
    ).all()
    return jsonify({
        'sessions': [s.to_dict() for s in sessions]
    }), 200
