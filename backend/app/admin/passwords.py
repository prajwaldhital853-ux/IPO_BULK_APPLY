from __future__ import annotations

import hashlib
import hmac
import re
import secrets

_SPECIAL_RE = re.compile(r'[^A-Za-z0-9]')


def hash_password(password: str, *, pepper: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        f'{pepper}:{salt}'.encode('utf-8'),
        120_000,
    ).hex()
    return f'{salt}${digest}'


def verify_password(password: str, stored: str, *, pepper: str) -> bool:
    try:
        salt, digest = stored.split('$', 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        f'{pepper}:{salt}'.encode('utf-8'),
        120_000,
    ).hex()
    return hmac.compare_digest(check, digest)


def hash_otp(otp: str, *, pepper: str) -> str:
    return hashlib.sha256(f'{pepper}:{otp}'.encode('utf-8')).hexdigest()


def verify_otp(otp: str, stored_hash: str, *, pepper: str) -> bool:
    check = hash_otp(otp, pepper=pepper)
    return hmac.compare_digest(check, stored_hash)


def generate_otp() -> str:
    return f'{secrets.randbelow(1_000_000):06d}'


def password_requirement_flags(password: str) -> dict[str, bool]:
    """Live / server-side checks for admin password strength."""
    return {
        'min_length': len(password) >= 8,
        'uppercase': any(c.isupper() for c in password),
        'lowercase': any(c.islower() for c in password),
        'digit': any(c.isdigit() for c in password),
        'special': bool(_SPECIAL_RE.search(password or '')),
    }


def validate_admin_password(password: str) -> None:
    flags = password_requirement_flags(password or '')
    missing: list[str] = []
    if not flags['min_length']:
        missing.append('at least 8 characters')
    if not flags['uppercase']:
        missing.append('1 uppercase letter')
    if not flags['lowercase']:
        missing.append('1 lowercase letter')
    if not flags['digit']:
        missing.append('1 number')
    if not flags['special']:
        missing.append('1 special character (!@#$%^&* etc.)')
    if missing:
        raise ValueError('Password must include: ' + ', '.join(missing))
