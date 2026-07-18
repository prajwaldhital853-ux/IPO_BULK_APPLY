from __future__ import annotations

from google.auth.transport import requests
from google.oauth2 import id_token


class GoogleAuthError(Exception):
    pass


def verify_google_id_token(token: str, client_ids: list[str]) -> dict:
    if not client_ids:
        raise GoogleAuthError('Google client IDs not configured')
    last_err: Exception | None = None
    for aud in client_ids:
        try:
            info = id_token.verify_oauth2_token(
                token,
                requests.Request(),
                audience=aud,
            )
            if info.get('iss') not in (
                'accounts.google.com',
                'https://accounts.google.com',
            ):
                raise GoogleAuthError('Invalid token issuer')
            sub = info.get('sub')
            email = info.get('email')
            if not sub or not email:
                raise GoogleAuthError('Missing sub or email in Google token')
            return {
                'sub': str(sub),
                'email': str(email),
                'name': str(info.get('name') or ''),
                'picture': info.get('picture'),
            }
        except Exception as e:  # noqa: BLE001
            last_err = e
            continue
    raise GoogleAuthError(str(last_err or 'Invalid Google token'))
