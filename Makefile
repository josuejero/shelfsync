.PHONY: infra-up infra-down infra-up-full infra-down-full api-test web-check dev api-alembic

infra-up:
	docker compose -f infra/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker-compose.yml down

infra-up-full:
	docker compose -f infra/docker-compose.full.yml up -d --build

infra-down-full:
	docker compose -f infra/docker-compose.full.yml down

api-test:
	cd services/api && . .venv/bin/activate && black . && isort . && pytest

web-check:
	cd apps/web && npm run lint && npm run build

dev:
	./scripts/dev.sh

api-alembic:
	cd services/api && ./bin/alembic
