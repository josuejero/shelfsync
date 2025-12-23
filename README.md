# ShelfSync

ShelfSync links your Goodreads shelves to your local library catalog (Libby/OverDrive-backed) and shows availability in one place.

## Monorepo layout

- `apps/web`: Next.js UI
- `services/api`: FastAPI API
- `infra`: Docker Compose for Postgres + Redis
- `docs`: architecture notes + ADRs

## Phase 0: local dev

### Prereqs
- Docker
- Node.js 24
- Python 3.14

### First-time setup

#### API

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest