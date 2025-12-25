from __future__ import annotations

import importlib

from fastapi import APIRouter

api_router = APIRouter()


def _include(module_path: str) -> None:
    try:
        mod = importlib.import_module(module_path)
    except Exception:
        # Optional route module; ignore if not present.
        return

    router = getattr(mod, "router", None)
    if router is not None:
        api_router.include_router(router)


# Keep this list in the order you want routes registered.
for _mod in (
    "app.api.routes.health",
    "app.api.routes.auth",
    "app.api.routes.settings",
    "app.api.routes.libraries",
    "app.api.routes.shelf_sources",
    "app.api.routes.shelf_items",
    "app.api.routes.matching",
    "app.api.routes.dashboard",
    "app.api.routes.books",
    "app.api.routes.sync_runs",
):
    _include(_mod)
