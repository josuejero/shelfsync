from __future__ import annotations

from app.core.config import settings
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def init_otel(app) -> None:
    if not getattr(settings, "otel_enabled", False):
        return

    resource = Resource.create(
        {"service.name": getattr(settings, "api_name", "shelfsync-api")}
    )
    provider = TracerProvider(resource=resource)

    # Prefer env vars (OTEL_EXPORTER_OTLP_ENDPOINT, etc.); allow an optional settings override.
    endpoint = getattr(settings, "otel_otlp_endpoint", None)
    exporter = OTLPSpanExporter(endpoint=endpoint) if endpoint else OTLPSpanExporter()

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
