
# ShelfSync

[![Live site](https://img.shields.io/website?label=Live%20site&style=flat-square&url=https%3A%2F%2Fshelfsync-six.vercel.app)](https://shelfsync-six.vercel.app)
[![CI](https://github.com/josuejero/shelfsync/actions/workflows/ci.yml/badge.svg)](https://github.com/josuejero/shelfsync/actions/workflows/ci.yml)

Sync your Goodreads shelves with your public library catalog (Libby/OverDrive-style) availability - plus “read next” recommendations and availability notifications.

> Portfolio note: this repo is intentionally built to demonstrate full-stack + data/ML-adjacent + DevOps fundamentals (typed API contracts, background jobs, caching, tests, CI, security scanning, observability hooks), with a clear path to production integrations.

---

## Table of contents

- [ShelfSync](#shelfsync)
  - [Table of contents](#table-of-contents)
  - [What it does](#what-it-does)
  - [Tech stack](#tech-stack)
  - [Architecture](#architecture)
  - [Project status](#project-status)
  - [Quickstart](#quickstart)
    - [Prereqs](#prereqs)
    - [1) Start infrastructure (Postgres + Redis + Goodreads mock)](#1-start-infrastructure-postgres--redis--goodreads-mock)
    - [2) Run the API](#2-run-the-api)
    - [3) Run the web app](#3-run-the-web-app)
    - [4) Optional: run a background worker (RQ)](#4-optional-run-a-background-worker-rq)
  - [Local development](#local-development)
    - [Import a sample Goodreads shelf](#import-a-sample-goodreads-shelf)
    - [Demo login (local/dev)](#demo-login-localdev)
  - [Configuration](#configuration)
  - [Testing](#testing)
    - [API (pytest + formatting)](#api-pytest--formatting)
    - [Web (lint/build/tests)](#web-lintbuildtests)
  - [Key engineering highlights](#key-engineering-highlights)
    - [Backend engineering](#backend-engineering)
    - [Data + ML-adjacent engineering](#data--ml-adjacent-engineering)
    - [DevOps / cloud engineering](#devops--cloud-engineering)
  - [Repo layout](#repo-layout)
  - [Roadmap](#roadmap)
  - [Docs](#docs)
  - [License](#license)

---

## What it does

ShelfSync helps you answer: “Which books on my Goodreads shelves are available right now at my library?”

Core user flows:

- **Import** your shelf from Goodreads (CSV supported; RSS scaffolding exists).
- **Match** each shelf item to a library catalog entry (ISBN, exact metadata, and fuzzy matching with evidence).
- **Track availability** by format (ebook/audiobook), snapshot changes over time, and cache checks.
- **Recommend what to read next** using availability + hold pressure heuristics and your preferred formats.
- **Notify** you when an item becomes available (SSE stream backed by Redis Pub/Sub).

---

## Tech stack

**Frontend**
- Next.js (App Router) + React + TypeScript
- Tailwind CSS

**Backend**
- FastAPI + Pydantic + Uvicorn
- Postgres + SQLAlchemy + Alembic
- Redis + RQ (background jobs) + Redis Pub/Sub (SSE event streams)

**DevOps / Quality**
- Docker + Docker Compose (local infra + API container)
- GitHub Actions CI + CodeQL + Dependabot
- Optional OpenTelemetry instrumentation (FastAPI + httpx)

---

## Architecture

High-level request and data flow:

```txt
Next.js UI
  |
  |  (HTTP + cookies)
  v
FastAPI API  --------------------->  Postgres (normalized entities)
  |  \                                   ^
  |   \                                  |
  |    \-> Redis (cache, job queue, pubsub) 
  |
  +-> Provider adapters (catalog + availability)
        - fixture provider (today)
        - OverDrive/Libby provider (placeholder)
```

Two “provider” concepts are separated on purpose:

* **Catalog provider**: search and retrieve candidate books for matching.
* **Availability provider**: fetch availability signals and write snapshots.

This keeps matching logic testable and makes it easier to swap real integrations later.

---

## Project status

Implemented (working, tested):

* [x] Cookie-based auth (JWT) with password hashing
* [x] Goodreads CSV parsing + idempotent upsert into `shelf_items`
* [x] Goodreads RSS parsing utilities (fetch + parse)
* [x] Matching engine (ISBN/exact/fuzzy scoring) with match evidence
* [x] Availability snapshots + Redis caching helpers
* [x] “Read next” scoring
* [x] Notifications model + SSE stream (Redis Pub/Sub)
* [x] CI (web build/lint; API checks) + CodeQL + Dependabot

In progress / intentionally stubbed for phased delivery:

* [ ] Wire background jobs to run RSS sync + matching refresh end-to-end
* [ ] Real OverDrive/Libby integration behind provider interface
* [ ] Normalize all API routes under `/v1` (one route is currently unversioned)

---

## Quickstart

### Prereqs

* Docker + Docker Compose
* Node.js 24+
* Python (the API Docker image uses Python 3.14; local dev works with modern Python 3.x)

### 1) Start infrastructure (Postgres + Redis + Goodreads mock)

From repo root:

```bash
make infra-up
```


Ports (local):

* Postgres: `localhost:5432`
* Redis: `localhost:6379`
* Goodreads mock (Prism): `localhost:4010`

### 2) Run the API

```bash
cd services/api
cp .env.example .env

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

./bin/alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Sanity check:

```bash
curl http://localhost:8000/health
```

FastAPI docs:

* Swagger UI: `http://localhost:8000/docs`

### 3) Run the web app

```bash
cd apps/web
cp .env.local.example .env.local

npm ci
npm run dev
```

Open `http://localhost:3000`.

### 4) Optional: run a background worker (RQ)

Some API actions enqueue jobs; to execute them, run a worker in a separate terminal:

```bash
cd services/api
source .venv/bin/activate

# Connect to the same Redis from docker compose:
rq worker -u redis://localhost:6379/0
```

---

## Local development

### Import a sample Goodreads shelf

Use the built-in mock export:

* UI: **Settings -> Goodreads -> Upload CSV**
* File: `mock/goodreads/export.csv`

You should then see imported items listed in the Goodreads settings page.

### Demo login (local/dev)

If `DEMO_LOGIN_ENABLED=true` in `services/api/.env`, you can log in with:

* Email: `demo@example.com`
* Password: anything (local/dev only)

---

## Configuration

API config lives in `services/api/.env` (see `.env.example`).

Common knobs:

* `DATABASE_URL`, `REDIS_URL`
* `AUTH_SECRET_KEY` (change for anything beyond local)
* `CATALOG_PROVIDER=fixture` (demo mode)
* `FIXTURE_CATALOG_PATH=app/fixtures/catalog_fixture.json`
* `AVAILABILITY_CACHE_TTL_SECS=300`
* `OTEL_ENABLED=false` (set true + configure OTLP exporter env vars to enable tracing)

Web config lives in `apps/web/.env.local`:

* `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

---

## Testing

### API (pytest + formatting)

```bash
make api-test
```

Or:

```bash
cd services/api
source .venv/bin/activate
pytest
```

### Web (lint/build/tests)

```bash
make web-check
```

Or:

```bash
cd apps/web
npm run lint
npm run build
npm run test
```

---

## Key engineering highlights

This section is written for hiring managers across SWE, ML/data, and DevOps tracks.

### Backend engineering

* Clean separation between **domain services** (matching, scoring, import) and **transport** (FastAPI routes).
* Postgres schema supports idempotent ingestion and historical availability tracking.
* Rate limiting hooks and request tracing hooks are built in.

### Data + ML-adjacent engineering

* Matching supports:

  * Identifier matches (ISBN)
  * Exact title/author
  * Fuzzy scoring with explainable evidence (useful for debugging + future model evaluation)
* “Read next” scoring uses availability tiers + hold pressure heuristics with user-preferred formats.

### DevOps / cloud engineering

* Dockerized API with local Compose dependencies.
* CI + security scanning:

  * GitHub Actions workflow(s)
  * CodeQL for JS + Python
  * Dependabot for npm/pip/actions
* Optional OpenTelemetry instrumentation to export traces to an OTLP collector.

---

## Repo layout

```txt
apps/web        Next.js UI
services/api    FastAPI backend
infra           Docker Compose (Postgres, Redis, mock services, API container)
docs            Architecture notes + ADRs
mock            Sample Goodreads RSS/CSV fixtures
```

---

## Roadmap

Near-term (most valuable for real users):

* RSS sync: implement the end-to-end worker job using the existing fetch + parse utilities.
* Matching refresh: connect the job to the existing matching + persistence services.
* OverDrive/Libby provider: implement real catalog + availability calls behind the provider interfaces.
* Production deployment: add deployment manifests and secrets strategy.

---

## Docs

* `docs/architecture.md`
* `docs/adr/0001-tech-stack.md`
* `docs/adr/0002-goodreads-ingestion.md`

---

## License

See `LICENSE`.
