def test_start_sync_run_creates_run_and_enqueues_job(client, monkeypatch):
    # Arrange: sign in user (reuse existing helpers)
    # monkeypatch enqueue_availability_refresh to avoid hitting redis

    called = {}

    def fake_enqueue_availability_refresh(*, sync_run_id):
        called["id"] = str(sync_run_id)

    monkeypatch.setattr(
        "app.api.routes.sync_runs.enqueue_availability_refresh",
        fake_enqueue_availability_refresh,
    )

    # Act
    resp = client.post("/v1/sync-runs", json={"kind": "availability_refresh"})

    # Assert
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "queued"
    assert called["id"] == body["id"]
