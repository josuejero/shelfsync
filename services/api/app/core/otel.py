from __future__ import annotations

import logging

from fastapi import FastAPI

logger = logging.getLogger(__name__)

from app.core.config import settings
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


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


def init_otel(app) -> None:
    if not getattr(settings, "otel_enabled", False):
        return

    resource = Resource.create({"service.name": "shelfsync-api"})
    provider = TracerProvider(resource=resource)

    exporter = OTLPSpanExporter(
        endpoint=getattr(settings, "otel_otlp_endpoint", "http://localhost:4318/v1/traces")
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
