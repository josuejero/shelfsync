from __future__ import annotations

import redis
from app.core.config import settings
from rq import Queue


def get_queue() -> Queue:
    conn = redis.from_url(settings.redis_url)
    return Queue("default", connection=conn)
