from __future__ import annotations

import json
import logging
from typing import Any

import httpx

log = logging.getLogger('push.expo')

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

# Expo rejects the whole batch with HTTP 400 when tokens belong to different projects.
STALE_TICKET_ERRORS = frozenset(
    {
        'DeviceNotRegistered',
        'InvalidCredentials',
    },
)


def is_valid_expo_push_token(token: str) -> bool:
    token = token.strip()
    return token.startswith('ExponentPushToken[') and token.endswith(']')


def summarize_expo_tickets(tickets: list[Any]) -> dict[str, Any]:
    """Turn Expo ticket list into delivered/failed counts and error details."""
    delivered = 0
    errors: list[dict[str, str]] = []
    for ticket in tickets:
        if not isinstance(ticket, dict):
            continue
        if ticket.get('status') == 'ok':
            delivered += 1
            continue
        if ticket.get('status') == 'error':
            details = ticket.get('details')
            code = ''
            if isinstance(details, dict):
                code = str(details.get('error') or '')
            errors.append(
                {
                    'error': code or 'ExpoPushError',
                    'message': str(ticket.get('message') or ''),
                },
            )
            continue
        if ticket.get('error'):
            errors.append(
                {
                    'error': 'RequestError',
                    'message': str(ticket.get('error')),
                },
            )
    return {
        'delivered': delivered,
        'failed': len(errors),
        'errors': errors[:10],
    }


def stale_tokens_from_send(
    messages: list[dict[str, Any]],
    tickets: list[Any],
) -> list[str]:
    """Map Expo ticket errors back to push tokens that should be disabled."""
    stale: list[str] = []
    for msg, ticket in zip(messages, tickets, strict=False):
        if not isinstance(ticket, dict) or ticket.get('status') != 'error':
            continue
        details = ticket.get('details')
        code = ''
        if isinstance(details, dict):
            code = str(details.get('error') or '')
        if code in STALE_TICKET_ERRORS:
            token = str(msg.get('to') or '').strip()
            if token:
                stale.append(token)
    return stale


def _http_error_ticket(exc: httpx.HTTPStatusError) -> dict[str, Any]:
    detail = exc.response.text[:500]
    message = f'HTTP {exc.response.status_code}'
    try:
        payload = exc.response.json()
        errors = payload.get('errors')
        if isinstance(errors, list) and errors:
            first = errors[0]
            if isinstance(first, dict):
                message = str(first.get('message') or message)
                code = str(first.get('code') or 'RequestError')
                return {
                    'status': 'error',
                    'message': message,
                    'details': {'error': code, 'detail': detail},
                }
    except Exception:  # noqa: BLE001
        pass
    return {
        'status': 'error',
        'message': message,
        'details': {'error': 'RequestError', 'detail': detail},
    }


async def _post_expo_messages(
    client: httpx.AsyncClient,
    messages: list[dict[str, Any]],
) -> list[Any]:
    if not messages:
        return []

    try:
        res = await client.post(
            EXPO_PUSH_URL,
            json=messages,
            headers={
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        )
        res.raise_for_status()
        payload = res.json()
        data_out = payload.get('data')
        if isinstance(data_out, list):
            return data_out
        errors = payload.get('errors')
        if isinstance(errors, list) and errors:
            first = errors[0] if errors else {}
            message = ''
            code = 'ExpoPushError'
            if isinstance(first, dict):
                message = str(first.get('message') or '')
                code = str(first.get('code') or code)
            return [
                {
                    'status': 'error',
                    'message': message,
                    'details': {'error': code},
                }
                for _ in messages
            ]
        return [payload for _ in messages]
    except httpx.HTTPStatusError as exc:
        log.warning(
            'Expo push HTTP %s (%s messages): %s',
            exc.response.status_code,
            len(messages),
            exc.response.text[:500],
        )
        # Mixed old/new Expo project tokens fail the whole batch with HTTP 400.
        if exc.response.status_code == 400 and len(messages) > 1:
            tickets: list[Any] = []
            for msg in messages:
                tickets.extend(await _post_expo_messages(client, [msg]))
            return tickets
        ticket = _http_error_ticket(exc)
        return [ticket for _ in messages]
    except Exception as exc:  # noqa: BLE001
        log.warning('Expo push request failed: %s', exc)
        return [{'error': str(exc)} for _ in messages]


def _android_data_payload(
    *,
    title: str,
    body: str,
    base_data: dict[str, str],
    channel_id: str,
    image_url: str | None = None,
) -> dict[str, str]:
    """Data-only Expo payload so Android always renders via ExpoNotificationBuilder."""
    payload = {
        **base_data,
        'title': title,
        'message': body,
        'body': json.dumps(
            {'title': title, 'message': body, **base_data},
            separators=(',', ':'),
        ),
        'channelId': channel_id,
    }
    if image_url:
        payload['image'] = image_url
    return payload


def _build_messages(
    tokens: list[str],
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None,
    sound: str,
    channel_id: str,
    image_url: str | None,
) -> list[dict[str, Any]]:
    high_priority_channels = {
        'market',
        'market_v2',
        'ipo',
        'price_alerts',
        'bulk_trades',
        'account',
    }
    messages: list[dict[str, Any]] = []
    for token in tokens:
        base_data = {str(k): str(v) for k, v in (data or {}).items()}
        push_data = _android_data_payload(
            title=title,
            body=body,
            base_data=base_data,
            channel_id=channel_id,
            image_url=image_url,
        )
        # No root title/body or richContent: FCM would auto-render in background and
        # skip our patched ExpoNotificationBuilder (no right-side logo).
        msg: dict[str, Any] = {
            'to': token,
            'sound': sound,
            'channelId': channel_id,
            'data': push_data,
        }
        if channel_id in high_priority_channels:
            msg['priority'] = 'high'
        messages.append(msg)
    return messages


async def send_expo_push(
    tokens: list[str],
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    sound: str = 'default',
    channel_id: str = 'market_v2',
    image_url: str | None = None,
) -> dict[str, Any]:
    """Send Expo push notifications in chunks of 100."""
    unique = list(dict.fromkeys(t.strip() for t in tokens if t and t.strip()))
    valid = [t for t in unique if is_valid_expo_push_token(t)]
    skipped = len(unique) - len(valid)
    if skipped:
        log.warning('Skipped %s invalid Expo push token(s)', skipped)

    if not valid:
        return {
            'sent': 0,
            'tokenCount': 0,
            'delivered': 0,
            'failed': 0,
            'skippedInvalid': skipped,
            'errors': [],
            'staleTokens': [],
            'tickets': [],
        }

    messages = _build_messages(
        valid,
        title=title,
        body=body,
        data=data,
        sound=sound,
        channel_id=channel_id,
        image_url=image_url,
    )

    tickets: list[Any] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(messages), 100):
            chunk = messages[i : i + 100]
            tickets.extend(await _post_expo_messages(client, chunk))

    summary = summarize_expo_tickets(tickets)
    stale_tokens = stale_tokens_from_send(messages, tickets)
    if summary['failed']:
        log.warning(
            'Expo push delivery failures: delivered=%s failed=%s stale=%s errors=%s',
            summary['delivered'],
            summary['failed'],
            len(stale_tokens),
            summary['errors'],
        )
    return {
        'sent': summary['delivered'],
        'tokenCount': len(valid),
        'delivered': summary['delivered'],
        'failed': summary['failed'],
        'skippedInvalid': skipped,
        'errors': summary['errors'],
        'staleTokens': stale_tokens,
        'tickets': tickets,
    }
