from typing import Literal

from app.api.deps import get_current_user
from app.api.rate_limit import rate_limiter
from app.api.routes.dashboard_build import build_dashboard_out
from app.db.session import get_db
from app.schemas.dashboard import DashboardOut
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["dashboard"])


@router.get(
    "/dashboard",
    response_model=DashboardOut,
    dependencies=[Depends(rate_limiter("dashboard", limit=120, window_seconds=60))],
)
def get_dashboard(
    *,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    sort: Literal["read_next", "title", "updated"] = Query(default="read_next"),
) -> DashboardOut:
    return build_dashboard_out(db=db, user=user, limit=limit, offset=offset, sort=sort)
