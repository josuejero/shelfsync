export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-4xl font-bold">ShelfSync</h1>
        <p className="text-lg text-gray-600">
          Connect your Goodreads shelf and see what your library has available -
          in one dashboard.
        </p>

        <div className="rounded-xl border p-4">
          <p className="font-medium">Phase 0 status</p>
          <ul className="list-disc pl-6 text-sm text-gray-600">
            <li>Web app boots</li>
            <li>API health endpoint available</li>
            <li>Postgres + Redis available locally</li>
            <li>CI gates wired</li>
          </ul>
        </div>

        <div className="rounded-xl border p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-800">Next up</p>
          <p>
            Phase 1 adds database models + migrations, env-driven config, and the
            first adapter skeletons.
          </p>
        </div>

        <button
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled
          title="Phase 3+"
        >
          Try demo data (coming soon)
        </button>
      </div>
    </main>
  );
}