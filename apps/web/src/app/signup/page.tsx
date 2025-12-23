"use client";

import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

type UserOut = { id: string; email: string };

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch<UserOut>("/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-3xl font-bold">Create account</h1>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <input
              className="w-full rounded-lg border p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Password</span>
            <input
              className="w-full rounded-lg border p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          <button
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-gray-600">
          Already have an account? <a className="underline" href="/signin">Sign in</a>
        </p>
      </div>
    </main>
  );
}