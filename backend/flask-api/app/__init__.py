"""
Secure QR-Based Attendance System — Flask API
Handles: Authentication, Student operations, RBAC, Device binding
"""

from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os

load_dotenv()

db = SQLAlchemy()


def create_app():
    app = Flask(__name__)
    
    # Configuration
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-change-in-production')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
        'DATABASE_URL',
        'postgresql://postgres:postgres@localhost:5432/qr_attendance'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET'] = os.getenv('JWT_SECRET', 'jwt-secret-change-in-production')
    app.config['QR_HMAC_SECRET'] = os.getenv('QR_HMAC_SECRET', 'qr-hmac-secret-change-in-production')
    app.config['QR_WINDOW_SECONDS'] = int(os.getenv('QR_WINDOW_SECONDS', '10'))
    app.config['EXPRESS_API_URL'] = os.getenv('EXPRESS_API_URL', 'http://localhost:3000')
    
    # CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # Database
    db.init_app(app)
    
    # Register blueprints
    from app.auth import auth_bp
    from app.routes import attendance_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(attendance_bp, url_prefix='/api/attendance')
    
    # Create tables
    with app.app_context():
        from app import models
        db.create_all()
    
    return app
