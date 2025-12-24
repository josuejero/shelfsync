from __future__ import annotations

import time

from fastapi import Depends, HTTPException

from app.api.deps import get_current_user
from app.core.redis_client import get_redis


def rate_limiter(*, scope: str, limit: int, window_seconds: int):
    """Simple fixed-window rate limit backed by Redis.

    Keyed by: scope + user_id + window bucket.
    """

    def _dep(user=Depends(get_current_user)):
        r = get_redis()
        if r is None:
            return  # graceful degrade

        now = int(time.time())
        bucket = now // window_seconds
        key = f"rl:{scope}:{user.id}:{bucket}"

        # INCR then set expiry once per bucket
        count = int(r.incr(key))
        if count == 1:
            r.expire(key, window_seconds)

        if count > limit:
            retry_after = window_seconds - (now % window_seconds)
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded",
                headers={"Retry-After": str(retry_after)},
            )

    return _dep
