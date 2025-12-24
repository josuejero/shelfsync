from __future__ import annotations

from functools import lru_cache

import redis
import redis.asyncio as redis_async


@lru_cache
def get_redis(url: str) -> redis.Redis:
    return redis.Redis.from_url(url, decode_responses=True)


def get_redis_async(url: str) -> redis_async.Redis:
    return redis_async.Redis.from_url(url, decode_responses=False)
