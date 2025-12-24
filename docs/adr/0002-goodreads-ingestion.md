# 0002: Goodreads ingestion strategy

## Status
Accepted

## Context
We need a reliable way to ingest a user’s Goodreads shelves into ShelfSync.

## Decision
Use RSS as the primary ingestion mechanism and CSV as a fallback.

## Consequences
- RSS allows periodic background sync.
- CSV supports users who cannot access RSS.
- Idempotency is enforced by external IDs when present.