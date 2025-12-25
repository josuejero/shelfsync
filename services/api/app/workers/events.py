from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.core.config import settings
from app.core.redis import get_redis


def publish_sync_event(
    *, user_id: str, run_id: str, type_: str, payload: dict[str, Any]
):
    r = get_redis(settings.redis_url)
    channel = f"sync:{user_id}:{run_id}"
    body = {
        "type": type_,
        "payload": payload,
        "ts": datetime.utcnow().isoformat() + "Z",
    }
    r.publish(channel, json.dumps(body))


def publish_notification_event(*, user_id: str, payload: dict[str, Any]) -> None:
    r = get_redis(settings.redis_url)
    channel = f"notify:{user_id}"
    body = {
        "type": "notification",
        "payload": payload,
        "ts": datetime.utcnow().isoformat() + "Z",
    }
    r.publish(channel, json.dumps(body))