import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.shelf_items import router as shelf_items_router
from app.api.routes.shelf_sources import router as shelf_sources_router
from app.core.config import settings
from app.core.otel import maybe_enable_otel



def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


configure_logging()
app = FastAPI(title=settings.api_name)
maybe_enable_otel(app, enabled=settings.otel_enabled, service_name=settings.api_name)

# CORS must allow credentials for cookie auth
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Unversioned health
app.include_router(health_router)

# Versioned API
v1 = APIRouter(prefix="/v1")
v1.include_router(auth_router)
v1.include_router(shelf_sources_router)
v1.include_router(shelf_items_router)
app.include_router(v1)
