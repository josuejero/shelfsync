import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return new Response("Missing path", { status: 400 });
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  const targetUrl = new URL(path, apiBase);

  const res = await fetch(targetUrl, {
    method: "GET",
    headers: {
      // forward cookies for auth
      cookie: req.headers.get("cookie") || "",
      accept: "text/event-stream",
    },
    cache: "no-store",
  });

  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}