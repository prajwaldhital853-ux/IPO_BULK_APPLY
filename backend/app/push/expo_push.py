from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger('push.expo')

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


async def send_expo_push(
    tokens: list[str],
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    sound: str = 'default',
    channel_id: str = 'market',
) -> dict[str, Any]:
    """Send Expo push notifications in chunks of 100."""
    unique = [t.strip() for t in tokens if t and t.strip()]
    if not unique:
        return {'sent': 0, 'tickets': []}

    messages = [
        {
            'to': token,
            'title': title,
            'body': body,
            'sound': sound,
            'channelId': channel_id,
            'data': data or {},
        }
        for token in unique
    ]

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

    return {'sent': len(unique), 'tickets': tickets}
