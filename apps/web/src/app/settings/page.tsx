"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AuthGuard } from "@/components/AuthGuard";
import { apiFetch } from "@/lib/api";

type SettingsOut = { library_system: string | null; preferred_formats: string[]; updated_at: string };
type LibraryOut = { id: string; name: string };

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsOut | null>(null);
  const [libraries, setLibraries] = useState<LibraryOut[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [librarySystem, setLibrarySystem] = useState<string>("");
  const [formats, setFormats] = useState<{ ebook: boolean; audiobook: boolean }>({ ebook: true, audiobook: false });

  useEffect(() => {
    (async () => {
      try {
        const [s, libs] = await Promise.all([
          apiFetch<SettingsOut>("/v1/settings"),
          apiFetch<LibraryOut[]>("/v1/libraries"),
        ]);
        setSettings(s);
        setLibraries(libs);
        setLibrarySystem(s.library_system ?? "");
        setFormats({ ebook: s.preferred_formats.includes("ebook"), audiobook: s.preferred_formats.includes("audiobook") });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load settings.";
        setError(msg);
      }
    })();
  }, []);

  const preferredFormats = useMemo(() => {
    const out: string[] = [];
    if (formats.ebook) out.push("ebook");
    if (formats.audiobook) out.push("audiobook");
    // Always keep at least one format selected
    return out.length ? out : ["ebook"];
  }, [formats]);

  async function save() {
    setOk(null);
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch<SettingsOut>("/v1/settings", {
        method: "PATCH",
        body: JSON.stringify({
          library_system: librarySystem || null,
          preferred_formats: preferredFormats,
        }),
      });
      setSettings(res);
      setOk("Saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGuard>
      <main className="min-h-screen px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <header className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl tracking-tight">Preferences</h1>
                <p className="text-sm text-black/60">Choose your library and formats.</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Link className="rounded-full border border-black/10 px-4 py-2 hover:bg-black/5" href="/dashboard">
                  Back
                </Link>
                <Link className="rounded-full border border-black/10 px-4 py-2 hover:bg-black/5" href="/settings/goodreads">
                  Import/Connect
                </Link>
              </div>
            </div>
          </header>

          <section className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
            {error ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
            ) : null}
            {ok ? (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                {ok}
              </div>
            ) : null}

            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Library</label>
                <select
                  value={librarySystem}
                  onChange={(e) => setLibrarySystem(e.target.value)}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm"
                >
                  <option value="">— Select a library —</option>
                  {libraries.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.id})
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-black/60">Library selection is used to scope availability lookups and caching.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Preferred formats</label>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formats.ebook}
                      onChange={(e) => setFormats((f) => ({ ...f, ebook: e.target.checked }))}
                    />
                    Ebook
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formats.audiobook}
                      onChange={(e) => setFormats((f) => ({ ...f, audiobook: e.target.checked }))}
                    />
                    Audiobook
                  </label>
                </div>
                <p className="mt-2 text-xs text-black/60">At least one format must be selected.</p>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-black/60">
                  Last updated: {settings?.updated_at ? new Date(settings.updated_at).toLocaleString() : "—"}
                </div>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}