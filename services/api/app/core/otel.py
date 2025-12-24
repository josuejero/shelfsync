from __future__ import annotations

import logging

from fastapi import FastAPI

logger = logging.getLogger(__name__)


def maybe_enable_otel(app: FastAPI, enabled: bool, service_name: str) -> None:
    if not enabled:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    except Exception:  # pragma: no cover - safety net for optional deps
        logger.exception("OpenTelemetry dependencies unavailable")
        return

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(provider)
    provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    FastAPIInstrumentor.instrument_app(app)
    logger.info("OpenTelemetry instrumentation enabled")
