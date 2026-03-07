"""
Device Fingerprinting & Binding
Captures browser fingerprint on first scan and locks account to that device.
"""
from flask import request
from app import db
from app.models import User
from datetime import datetime, timezone
import hashlib


def generate_device_fingerprint():
    """
    Generate a device fingerprint from request headers.
    In a browser context, the client sends a computed fingerprint
    (canvas hash + WebGL + user agent + screen resolution).
    Falls back to a server-side hash of available headers.
    """
    # Client-provided fingerprint (from JavaScript)
    client_fingerprint = request.headers.get('X-Device-Fingerprint')
    if client_fingerprint:
        return client_fingerprint
    
    # Fallback: server-side fingerprint from headers
    components = [
        request.headers.get('User-Agent', ''),
        request.headers.get('Accept-Language', ''),
        request.headers.get('Accept-Encoding', ''),
        request.remote_addr or ''
    ]
    
    raw = '|'.join(components)
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def bind_device(user, device_id):
    """Bind a device to a user account on first scan."""
    user.device_id = device_id
    user.device_bound_at = datetime.now(timezone.utc)
    db.session.commit()
    return True


def verify_device(user, device_id):
    """
    Verify that the request comes from the bound device.
    Returns (success: bool, message: str)
    """
    # First-time binding
    if user.device_id is None:
        bind_device(user, device_id)
        return True, 'Device bound successfully (first scan)'
    
    # Verify match
    if user.device_id == device_id:
        return True, 'Device verified'
    
    return False, 'Device mismatch — attendance can only be marked from your registered device'
