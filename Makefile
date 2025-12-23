.PHONY: infra-up infra-down api-test web-check dev api-alembic

infra-up:
	docker compose -f infra/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker-compose.yml down

api-test:
	cd services/api && . .venv/bin/activate && black . && isort . && pytest

web-check:
	cd apps/web && npm run lint && npm run build

dev:
	./scripts/dev.sh

api-alembic:
	cd services/api && ./bin/alembic $(ARGS)
