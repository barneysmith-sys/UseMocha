import { NextResponse } from "next/server";
import { LIVE_MODEL, LIVE_SYSTEM, LIVE_VOICE } from "@/lib/interview/livePrompt";

export const runtime = "nodejs";

const hits = new Map<string, { count: number; reset: number }>();

function limited(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = hits.get(ip);
  if (!current || current.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.GEMINI_API_KEY), voice: LIVE_VOICE, model: LIVE_MODEL });
}

export async function POST(request: Request) {
  if (limited(request)) return NextResponse.json({ available: false, reason: "rate_limited" }, { status: 429 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ available: false, reason: "not_configured" }, { status: 503 });

  const expireTime = new Date(Date.now() + 30 * 60_000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 5 * 60_000).toISOString();
  const constrained = {
    uses: 1,
    expireTime,
    newSessionExpireTime,
    liveConnectConstraints: {
      model: `models/${LIVE_MODEL}`,
      config: {
        sessionResumption: {},
        responseModalities: ["AUDIO"],
        systemInstruction: { parts: [{ text: LIVE_SYSTEM }] },
      },
    },
  };
  const minimal = { uses: 1, expireTime, newSessionExpireTime };

  let tokenName = "";
  let lastStatus = 502;
  for (const body of [constrained, minimal]) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
      lastStatus = res.status;
      continue;
    }
    try {
      const data = JSON.parse(raw) as { name?: string };
      tokenName = data.name ?? "";
    } catch {
      tokenName = "";
    }
    if (tokenName) break;
  }

  if (!tokenName) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: "live_token_failed", status: lastStatus }));
    return NextResponse.json({ available: false, reason: "token_failed" }, { status: 502 });
  }

  return NextResponse.json({
    available: true,
    token: tokenName,
    websocketUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenName)}`,
    model: LIVE_MODEL,
    voice: LIVE_VOICE,
  });
}
