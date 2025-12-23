"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  async function onLogout() {
    await apiFetch("/v1/auth/logout", { method: "POST" });
    router.push("/signin");
  }

  return (
    <AuthGuard>
      <main className="min-h-screen p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={onLogout}>
              Log out
            </button>
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-medium">Phase 1 status</p>
            <ul className="list-disc pl-6 text-sm text-gray-600">
              <li>Auth works (HttpOnly cookie)</li>
              <li>Protected routes redirect</li>
              <li>Core domain tables migrated</li>
            </ul>
          </div>

          <div className="rounded-xl border p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800">Next up</p>
            <p>Phase 2 adds Goodreads ingestion (RSS + CSV) and persists shelf items for the authenticated user.</p>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}