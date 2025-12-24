import os


class FixtureProvider(...):
    def availability_bulk(self, items):
        if os.getenv("SYNC_INJECT_FAILURE_ONCE") == "true":
            os.environ["SYNC_INJECT_FAILURE_ONCE"] = "false"
            raise RuntimeError("Injected provider failure (demo)")

        # existing deterministic fixture logic
