import redis
from rq import Queue

from app.core.config import settings


def get_queue() -> Queue:
    conn = redis.from_url(settings.redis_url)
    return Queue("shelfsync", connection=conn)