"""
Configuration for Flask API
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-change-in-production')
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        'postgresql://postgres:postgres@localhost:5432/qr_attendance'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET = os.getenv('JWT_SECRET', 'jwt-secret-change-in-production')
    QR_HMAC_SECRET = os.getenv('QR_HMAC_SECRET', 'qr-hmac-secret-change-in-production')
    QR_WINDOW_SECONDS = int(os.getenv('QR_WINDOW_SECONDS', '10'))
    EXPRESS_API_URL = os.getenv('EXPRESS_API_URL', 'http://localhost:3000')
