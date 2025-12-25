from __future__ import annotations

import time
from typing import Callable, cast

from app.api.deps import get_current_user
from app.core.redis_client import get_redis
from fastapi import Depends, HTTPException
from redis import Redis


def rate_limiter(
    scope: str,
    *,
    limit: int,
    window_seconds: int,
) -> Callable[[], None]:
    """Simple fixed-window rate limiter using Redis INCR + EXPIRE.

    If Redis is unavailable, the limiter becomes a no-op (fail open).
    """

    def _dep(user=Depends(get_current_user)) -> None:
        r = get_redis()
        if r is None:
            return

        # Fixed-window bucket
        now = int(time.time())
        bucket = now // window_seconds
        key = f"rl:{scope}:{user.id}:{bucket}"

        try:
            # redis-py typing can be `Awaitable[Any] | Any` in stubs; cast to satisfy mypy.
            count = cast(int, cast(Redis, r).incr(key))
            if count == 1:
                cast(Redis, r).expire(key, window_seconds)
        except Exception:
            # If Redis errors, don't block requests.
            return

        if count > limit:
            retry_after = max(1, window_seconds - (now % window_seconds))
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded",
                headers={"Retry-After": str(retry_after)},
            )

    return _dep
