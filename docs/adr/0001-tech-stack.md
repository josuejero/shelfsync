# ADR 0001: Tech stack

## Status
Accepted

## Context
ShelfSync needs a fast-to-demo full-stack portfolio project with modern tooling, strong local dev ergonomics, and a clear path to deployment.

## Decision
- Web: Next.js + React + TypeScript + Tailwind
- API: FastAPI + Uvicorn + Pydantic
- Data: Postgres + SQLAlchemy + Alembic
- Caching/queue: Redis
- HTTP: httpx

## Consequences
- Great developer experience and hiring-manager familiarity.
- Python backend supports data parsing and automation easily.
- Clear hosting story: Vercel + Koyeb + Supabase + Upstash.