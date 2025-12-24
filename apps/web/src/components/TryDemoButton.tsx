"use client";

import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";
const DEMO_RSS_URL = "https://www.goodreads.com/shelf/rss?user=demo&shelf=read";

type TryDemoButtonProps = {
  className?: string;
};

export function TryDemoButton({ className }: TryDemoButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = pending ? "Loading demo..." : "Try demo data";

  async function handleClick() {
    setError(null);
    setPending(true);

    try {
      await apiFetch("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      });

      await apiFetch("/v1/shelf-sources/rss", {
        method: "POST",
        body: JSON.stringify({ rss_url: DEMO_RSS_URL, shelf_name: "Demo shelf" }),
      });

      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load demo data.";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  const buttonClassName = `${className ?? ""} disabled:opacity-60 disabled:cursor-not-allowed`;

  return (
    <div className="space-y-2">
      <button className={buttonClassName} disabled={pending} onClick={handleClick}>
        {label}
      </button>
      {error ? <p className="text-xs text-[var(--accent)]">{error}</p> : null}
    </div>
  );
}
