import Link from "next/link";

import { TryDemoButton } from "@/components/TryDemoButton";

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,_rgba(217,93,57,0.35),_rgba(217,93,57,0))] blur-2xl" />
          <div className="absolute right-10 top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,_rgba(42,157,143,0.35),_rgba(42,157,143,0))] blur-2xl" />
          <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,_rgba(244,162,97,0.25),_rgba(244,162,97,0))] blur-3xl" />
        </div>

        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-12 lg:py-20">
          <nav className="flex items-center justify-between text-sm">
            <div className="font-display text-xl tracking-tight">ShelfSync</div>
            <div className="flex items-center gap-4">
              <Link className="rounded-full border border-black/10 px-4 py-2 text-xs uppercase tracking-[0.2em]" href="/signin">
                Sign in
              </Link>
              <Link className="rounded-full bg-[var(--ink)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[var(--paper)]" href="/signup">
                Create account
              </Link>
            </div>
          </nav>

          <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-[0.5em] text-black/50">Goodreads → Library</p>
              <h1 className="font-display text-4xl leading-tight sm:text-5xl">
                Sync your shelves, then see what your library can actually loan today.
              </h1>
              <p className="max-w-xl text-lg text-black/70">
                Import RSS or CSV exports from Goodreads, normalize the titles, and get a clean
                availability snapshot you can act on.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <TryDemoButton className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-28px_var(--accent)]" />
                <Link className="rounded-full border border-black/20 px-6 py-3 text-sm font-semibold" href="/signup">
                  Start a new shelf
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-black/10 bg-[var(--card)] p-6 shadow-[0_25px_60px_-40px_var(--shadow)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-black/40">
                  <span>Connect</span>
                  <span>Import</span>
                  <span>Check</span>
                </div>
                <div className="rounded-2xl border border-black/10 bg-white/70 p-5">
                  <p className="text-sm font-semibold">Demo pipeline</p>
                  <div className="mt-4 space-y-3 text-sm text-black/60">
                    <div className="flex items-center justify-between">
                      <span>Goodreads RSS</span>
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs">connected</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>CSV export</span>
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs">optional</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Availability scan</span>
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs">next</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-black/10 bg-white/70 p-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-black/40">Snapshot</p>
                    <p className="mt-3 text-2xl font-semibold text-[var(--accent)]">24</p>
                    <p className="text-xs text-black/50">titles ready to check</p>
                  </div>
                  <div className="rounded-2xl border border-black/10 bg-white/70 p-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-black/40">Coverage</p>
                    <p className="mt-3 text-2xl font-semibold text-[var(--accent-2)]">82%</p>
                    <p className="text-xs text-black/50">with ISBN metadata</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            {[
              {
                title: "Connect once",
                description: "Paste your Goodreads RSS or upload CSV exports. We store the source and keep it fresh."
              },
              {
                title: "Normalize titles",
                description: "We extract ISBNs, ASINs, and Goodreads IDs so every item is ready for matching."
              },
              {
                title: "Track availability",
                description: "See what your library can deliver today and what needs a manual check."
              }
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-black/10 bg-white/70 p-6 shadow-[0_25px_60px_-48px_var(--shadow)]"
              >
                <p className="font-display text-xl">{item.title}</p>
                <p className="mt-3 text-sm text-black/60">{item.description}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
