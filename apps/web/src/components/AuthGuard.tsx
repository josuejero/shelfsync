"use client";

import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type UserOut = { id: string; email: string };

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserOut | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await apiFetch<UserOut>("/v1/auth/me");
        if (!alive) return;
        setUser(me);
      } catch {
        router.push("/signin");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Checking session…</div>;
  }

  if (!user) return null;

  return <>{children}</>;
}