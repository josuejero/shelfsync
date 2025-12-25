from __future__ import annotations

from app.core.config import settings
from app.workers.redis_conn import get_redis_connection
from rq import Queue, Retry
from rq.job import Job


def get_queue() -> Queue:
    conn = get_redis_connection()
    return Queue("default", connection=conn)


def enqueue_availability_refresh(*, sync_run_id: str) -> Job:
    q = get_queue()
    return q.enqueue(
        "app.workers.jobs.availability_refresh_job",
        sync_run_id,
        retry=Retry(max=2, interval=[5, 15]),
        job_timeout=settings.worker_job_timeout_secs,
    )
