from __future__ import annotations

from app.api.router import api_router
from app.api.routes.notifications import router as notifications_router
from app.core.config import settings
from app.core.otel import init_otel
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title=settings.api_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(notifications_router)

init_otel(app)
