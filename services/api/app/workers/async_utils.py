from __future__ import annotations

import asyncio
from typing import Any, Awaitable, TypeVar

T = TypeVar("T")


def run_async(coro: Awaitable[T]) -> T:
    """Run an async coroutine from a sync context.

    Uses a fresh event loop to avoid "asyncio.run() cannot be called" edge cases.
    """
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        try:
            loop.close()
        finally:
            asyncio.set_event_loop(None)
