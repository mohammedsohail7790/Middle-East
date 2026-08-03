import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

function gatewayBase(): string {
  return (
    process.env.GATEWAY_PROXY_URL ||
    process.env.NEXT_PUBLIC_GATEWAY_API_URL ||
    "https://call-iq-gateway.onrender.com"
  ).replace(/\/$/, "");
}

/** Server-side proxy — Vercel rewrites break binary MP3 responses from Render. */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const csrf = req.headers.get("x-csrf-token");
  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${gatewayBase()}/api/v1/ai-config/test-voice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gateway unreachable";
    return NextResponse.json(
      { success: false, error: `Voice preview failed: ${msg}` },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await upstream.json().catch(() => ({}));
      return NextResponse.json(json, { status: upstream.status });
    }
    const text = await upstream.text().catch(() => "");
    return NextResponse.json(
      { success: false, error: text.slice(0, 300) || `Gateway error ${upstream.status}` },
      { status: upstream.status }
    );
  }

  const audio = await upstream.arrayBuffer();
  return new NextResponse(audio, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
