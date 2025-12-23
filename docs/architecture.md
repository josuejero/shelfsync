# Architecture (Phase 0)

## High-level

- `apps/web` is a Next.js UI.
- `services/api` is a FastAPI backend.
- `infra/docker-compose.yml` runs local Postgres + Redis.

## Data flow (today)

Web -> API: health checks only.

## Data flow (planned)

Web -> API -> Goodreads + Library adapters -> normalized database -> jobs/streams -> UI.