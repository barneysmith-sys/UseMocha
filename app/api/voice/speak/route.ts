import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { pcmToWav, sampleRateFromMime } from "@/lib/voice/wav";

export const runtime = "nodejs";

const MODELS = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-flash-tts",
];
const VOICE = "Charon";

const cache = new Map<string, { body: Uint8Array; type: string; model: string }>();
const hits = new Map<string, { count: number; reset: number }>();

function sanitise(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

function limited(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = hits.get(ip);
  if (!current || current.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 40;
}

async function synthesize(apiKey: string, text: string, model: string) {
  const contents = [{ parts: [{ text }] }];
  const speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } };
  const bodies = [
    { contents, generationConfig: { responseModalities: ["AUDIO"], speechConfig } },
    { contents, generationConfig: { responseModalities: ["AUDIO"] }, speechConfig },
  ];
  let lastError: Error & { status?: number } = new Error("TTS failed");
  for (const body of bodies) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const raw = await res.text();
    let data: { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]; error?: { message?: string } } | null = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!res.ok) {
      lastError = new Error(data?.error?.message || raw.slice(0, 240));
      lastError.status = res.status;
      continue;
    }
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((part) => part.inlineData?.data);
    if (!audioPart?.inlineData?.data) {
      lastError = new Error("No audio in TTS response");
      continue;
    }
    const mime = audioPart.inlineData.mimeType || "";
    const bytes = Buffer.from(audioPart.inlineData.data, "base64");
    if (/wav|wave/i.test(mime)) return { body: new Uint8Array(bytes), type: "audio/wav" };
    if (/mpeg|mp3/i.test(mime)) return { body: new Uint8Array(bytes), type: "audio/mpeg" };
    return { body: pcmToWav(bytes, sampleRateFromMime(mime)), type: "audio/wav" };
  }
  throw lastError;
}

export async function POST(request: Request) {
  if (limited(request)) return NextResponse.json({ error: "Too many speech requests." }, { status: 429 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Speech is not configured." }, { status: 503 });

  let payload: { text?: unknown; question?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const text = sanitise(payload.text ?? payload.question, 1200);
  if (!text) return NextResponse.json({ error: "text is required." }, { status: 400 });

  const hash = createHash("sha256").update(`spoken-line-v2\n${text}`).digest("hex").slice(0, 16);
  const cached = cache.get(hash);
  if (cached) {
    return new NextResponse(Buffer.from(cached.body), {
      headers: {
        "Content-Type": cached.type,
        "Cache-Control": "private, max-age=86400",
        "X-Mocha-Voice": VOICE,
        "X-Mocha-Tts-Model": cached.model,
      },
    });
  }

  let lastError: (Error & { status?: number }) | null = null;
  for (const model of MODELS) {
    try {
      const audio = await synthesize(apiKey, text, model);
      if (cache.size > 40) cache.clear();
      cache.set(hash, { ...audio, model });
      return new NextResponse(Buffer.from(audio.body), {
        headers: {
          "Content-Type": audio.type,
          "Cache-Control": "private, max-age=86400",
          "X-Mocha-Voice": VOICE,
          "X-Mocha-Tts-Model": model,
        },
      });
    } catch (error) {
      lastError = error as Error & { status?: number };
      if (lastError.status === 401) break;
    }
  }
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "speak_failed", message: lastError?.message ?? "unknown" }));
  return NextResponse.json({ error: "Could not speak the line." }, { status: 502 });
}
