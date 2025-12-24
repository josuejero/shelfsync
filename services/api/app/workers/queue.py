from __future__ import annotations

from app.workers.redis_conn import get_redis_connection
from rq import Queue

QUEUE_NAME = "shelfsync"


def get_queue() -> Queue:
    conn = get_redis_connection()
    return Queue(QUEUE_NAME, connection=conn)
