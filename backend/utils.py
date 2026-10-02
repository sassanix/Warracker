# backend/utils.py
"""
Shared utility functions for the Warracker application
"""

def get_smtp_from_address():
    """Resolve the sender From address for outgoing mail (issue #201).

    Precedence: SMTP_FROM_ADDRESS > SMTP_SENDER_EMAIL (legacy) >
    SMTP_USERNAME > default. A single documented variable
    (SMTP_FROM_ADDRESS) is the canonical one.
    """
    import os
    return (
        os.environ.get('SMTP_FROM_ADDRESS')
        or os.environ.get('SMTP_SENDER_EMAIL')
        or os.environ.get('SMTP_USERNAME')
        or 'notifications@warracker.com'
    )


def allowed_file(filename):
    """Check if the file extension is allowed"""
    ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'zip', 'rar', 'webp', 'gif'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS 