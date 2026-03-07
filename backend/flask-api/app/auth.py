"""
Authentication Blueprint — Register, Login, JWT
"""
from flask import Blueprint, request, jsonify, current_app
from app import db
from app.models import User
import hashlib
import os
import jwt
import datetime
from functools import wraps

auth_bp = Blueprint('auth', __name__)


# ─── JWT Middleware ─────────────────────────────────────────────
def token_required(f):
    """Decorator to enforce JWT authentication on routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'error': 'Authentication token is missing'}), 401
        
        try:
            payload = jwt.decode(
                token,
                current_app.config['JWT_SECRET'],
                algorithms=['HS256']
            )
            current_user = User.query.get(payload['user_id'])
            if not current_user:
                return jsonify({'error': 'User not found'}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# ─── Register ──────────────────────────────────────────────────
@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user (teacher or student) with university credentials."""
    data = request.get_json()
    
    # Validate required fields
    required = ['university_id', 'name', 'email', 'password', 'role']
    for field in required:
        if field not in data or not data[field]:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Validate role
    if data['role'] not in ('teacher', 'student'):
        return jsonify({'error': 'Role must be either "teacher" or "student"'}), 400
    
    # Check duplicates
    if User.query.filter_by(university_id=data['university_id']).first():
        return jsonify({'error': 'University ID already registered'}), 409
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already registered'}), 409
    
    # Hash password with PBKDF2-SHA256 (NIST recommended)
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac('sha256', data['password'].encode('utf-8'), salt, 260000)
    password_hash = salt.hex() + ':' + key.hex()
    
    user = User(
        university_id=data['university_id'],
        name=data['name'],
        email=data['email'],
        password_hash=password_hash,
        role=data['role']
    )
    
    db.session.add(user)
    db.session.commit()
    
    return jsonify({
        'message': 'Registration successful',
        'user': user.to_dict()
    }), 201


# ─── Login ─────────────────────────────────────────────────────
@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token."""
    data = request.get_json()
    
    if not data or not data.get('university_id') or not data.get('password'):
        return jsonify({'error': 'University ID and password are required'}), 400
    
    user = User.query.filter_by(university_id=data['university_id']).first()
    
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    
    # Verify password with PBKDF2-SHA256
    try:
        stored_salt, stored_key = user.password_hash.split(':')
        salt = bytes.fromhex(stored_salt)
        key = hashlib.pbkdf2_hmac('sha256', data['password'].encode('utf-8'), salt, 260000)
        if key.hex() != stored_key:
            return jsonify({'error': 'Invalid credentials'}), 401
    except (ValueError, AttributeError):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    # Generate JWT token (24h expiry)
    token = jwt.encode({
        'user_id': user.id,
        'university_id': user.university_id,
        'role': user.role,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)
    }, current_app.config['JWT_SECRET'], algorithm='HS256')
    
    return jsonify({
        'message': 'Login successful',
        'token': token,
        'user': user.to_dict()
    }), 200


# ─── Get Profile ───────────────────────────────────────────────
@auth_bp.route('/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    """Get the authenticated user's profile."""
    return jsonify({'user': current_user.to_dict()}), 200
