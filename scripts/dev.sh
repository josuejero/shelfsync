#!/usr/bin/env bash
set -euo pipefail

# Phase 0: start local backing services + run web/api in watch mode

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

docker compose -f infra/docker-compose.yml up -d

echo "Backends are starting..."

echo "\nStarting API (FastAPI + Uvicorn reload)"
(
  cd services/api
  source .venv/bin/activate
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) &

API_PID=$!

echo "\nStarting Web (Next dev server)"
(
  cd apps/web
  npm run dev
) &

WEB_PID=$!

trap 'echo "\nShutting down..."; kill $API_PID $WEB_PID; docker compose -f infra/docker-compose.yml down' INT TERM

wait