from __future__ import annotations
import logging
from functools import lru_cache
import redis
from redis import Redis
from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache
def get_redis() -> Redis | None:
    try:
        client: Redis = redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        return client
    except Exception as exc:
        logger.warning("Redis unavailable; caching/rate limiting disabled: %s", exc)
        return None
