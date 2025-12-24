# ShelfSync

ShelfSync links your Goodreads shelves to your local library catalog (Libby/OverDrive-backed) and shows availability in one place.

## Monorepo layout

- `apps/web`: Next.js UI
- `services/api`: FastAPI API
- `infra`: Docker Compose for API + Postgres + Redis
- `docs`: architecture notes + ADRs

## Phase 0: local dev

### Prereqs
- Docker
- Node.js 24
- Python 3.14

### First-time setup

#### Local env vars

Load the API env vars into your shell before running CLI tools like `rq` or `redis-cli`:

```bash
source scripts/dev-env.sh
# or: eval "$(scripts/dev-env.sh --print)"
```

#### API

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

#### Migrations

Use the repo wrapper so Alembic runs with the `services/api/.venv` interpreter:
If `alembic` resolves to `/opt/homebrew/bin/alembic`, you're using the Homebrew
install (Python 3.11) and will hit `psycopg2` import errors.

```bash
cd services/api
./bin/alembic upgrade head
```

Generate new migrations once the database is at head.
If you see `Target database is not up to date`, run `./bin/alembic upgrade head`
before autogenerating.

```bash
cd services/api
./bin/alembic revision --autogenerate -m "phase1 init schema"
```

From the repo root:

```bash
make api-alembic ARGS="revision --autogenerate -m 'phase1 init schema'"
```
