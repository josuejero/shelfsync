import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const upstream = await fetch(`${apiBase}${path}`, {
    headers: {
      cookie: req.headers.get("cookie") ?? "",
      "accept": "text/event-stream",
    },
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}