"""
SQLAlchemy ORM Models
"""
from app import db
from datetime import datetime, timezone
import uuid


class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    university_id = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'teacher' or 'student'
    device_id = db.Column(db.String(512), nullable=True)
    device_bound_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    courses_taught = db.relationship('Course', backref='teacher', lazy=True)
    enrollments = db.relationship('Enrollment', backref='student', lazy=True)
    attendances = db.relationship('Attendance', backref='student', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'university_id': self.university_id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'device_bound': self.device_id is not None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Course(db.Model):
    __tablename__ = 'courses'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(150), nullable=False)
    teacher_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    enrollments = db.relationship('Enrollment', backref='course', lazy=True)
    sessions = db.relationship('Session', backref='course', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher.name if self.teacher else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Enrollment(db.Model):
    __tablename__ = 'enrollments'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    course_id = db.Column(db.String(36), db.ForeignKey('courses.id'), nullable=False)
    enrolled_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (db.UniqueConstraint('student_id', 'course_id'),)
    
    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'course_id': self.course_id,
            'enrolled_at': self.enrolled_at.isoformat() if self.enrolled_at else None
        }


class Session(db.Model):
    __tablename__ = 'sessions'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id = db.Column(db.String(36), db.ForeignKey('courses.id'), nullable=False)
    teacher_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    started_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    is_locked = db.Column(db.Boolean, default=False)
    locked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    attendances = db.relationship('Attendance', backref='session', lazy=True)
    used_nonces = db.relationship('UsedNonce', backref='session', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'course_id': self.course_id,
            'teacher_id': self.teacher_id,
            'course_code': self.course.code if self.course else None,
            'course_name': self.course.name if self.course else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'is_locked': self.is_locked,
            'locked_at': self.locked_at.isoformat() if self.locked_at else None,
            'attendance_count': len(self.attendances)
        }


class Attendance(db.Model):
    __tablename__ = 'attendance'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = db.Column(db.String(36), db.ForeignKey('sessions.id'), nullable=False)
    student_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    scanned_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    device_id = db.Column(db.String(512), nullable=False)
    nonce_used = db.Column(db.String(128), nullable=False)
    is_valid = db.Column(db.Boolean, default=True)
    
    __table_args__ = (db.UniqueConstraint('student_id', 'session_id'),)
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'student_id': self.student_id,
            'student_name': self.student.name if self.student else None,
            'student_university_id': self.student.university_id if self.student else None,
            'scanned_at': self.scanned_at.isoformat() if self.scanned_at else None,
            'is_valid': self.is_valid
        }


class UsedNonce(db.Model):
    __tablename__ = 'used_nonces'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    nonce = db.Column(db.String(128), unique=True, nullable=False)
    session_id = db.Column(db.String(36), db.ForeignKey('sessions.id'), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
