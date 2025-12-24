from __future__ import annotations

import redis
from app.core.config import settings
from redis import Redis


def get_redis_connection() -> Redis:
    """Return a Redis connection suitable for RQ (jobs + metadata)."""
    return redis.from_url(settings.redis_url)
