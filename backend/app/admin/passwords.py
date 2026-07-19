from __future__ import annotations

import hashlib
import hmac
import secrets


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
