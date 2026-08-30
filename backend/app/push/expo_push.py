from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger('push.expo')

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


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
    unique = [t.strip() for t in tokens if t and t.strip()]
    if not unique:
        return {
            'sent': 0,
            'tokenCount': 0,
            'delivered': 0,
            'failed': 0,
            'errors': [],
            'tickets': [],
        }

    messages: list[dict[str, Any]] = []
    high_priority_channels = {
        'market',
        'market_v2',
        'ipo',
        'price_alerts',
        'bulk_trades',
        'account',
    }
    for token in unique:
        msg: dict[str, Any] = {
            'to': token,
            'title': title,
            'body': body,
            'sound': sound,
            'channelId': channel_id,
            'data': data or {},
        }
        if channel_id in high_priority_channels:
            msg['priority'] = 'high'
        if image_url:
            msg['richContent'] = {'image': image_url}
        messages.append(msg)

    tickets: list[Any] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(messages), 100):
            chunk = messages[i : i + 100]
            try:
                res = await client.post(
                    EXPO_PUSH_URL,
                    json=chunk,
                    headers={
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                )
                res.raise_for_status()
                payload = res.json()
                data_out = payload.get('data')
                if isinstance(data_out, list):
                    tickets.extend(data_out)
                else:
                    tickets.append(payload)
            except Exception as e:  # noqa: BLE001
                log.warning('Expo push chunk failed: %s', e)
                tickets.append({'error': str(e)})

    summary = summarize_expo_tickets(tickets)
    if summary['failed']:
        log.warning(
            'Expo push delivery failures: delivered=%s failed=%s errors=%s',
            summary['delivered'],
            summary['failed'],
            summary['errors'],
        )
    return {
        'sent': summary['delivered'],
        'tokenCount': len(unique),
        'delivered': summary['delivered'],
        'failed': summary['failed'],
        'errors': summary['errors'],
        'tickets': tickets,
    }
