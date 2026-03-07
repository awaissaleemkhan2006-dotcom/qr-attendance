"""
Role-Based Access Control (RBAC)
"""
from functools import wraps
from flask import jsonify


def require_role(*roles):
    """
    Decorator that restricts access to users with specific roles.
    Must be used AFTER @token_required so current_user is available.
    
    Usage:
        @auth_bp.route('/admin-only')
        @token_required
        @require_role('teacher')
        def admin_endpoint(current_user):
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated(current_user, *args, **kwargs):
            if current_user.role not in roles:
                return jsonify({
                    'error': 'Access denied',
                    'message': f'This endpoint requires one of these roles: {", ".join(roles)}'
                }), 403
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator
