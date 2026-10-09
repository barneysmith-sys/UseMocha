import { NextResponse } from "next/server";
import { callGemini, visibleModelText } from "../../../../api/interview.js";
import { applyGrade, gradePrompt, parseGrade } from "@/lib/interview/grade";
import type { Debrief, Session, Turn } from "@/lib/interview/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Body = {
  trackName?: unknown;
  optionName?: unknown;
  difficulty?: unknown;
  turns?: unknown;
  debrief?: Debrief;
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ graded: false }, { status: 503 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ graded: false }, { status: 400 });
  }
  const turns = Array.isArray(body.turns) ? (body.turns as Turn[]).filter((turn) => turn && typeof turn.text === "string") : [];
  const candidate = turns.filter((turn) => turn.role === "candidate").map((turn) => turn.text).join(" ");
  if (candidate.trim().split(/\s+/).length < 12 || !body.debrief) {
    return NextResponse.json({ graded: false });
  }

  const session = {
    trackName: typeof body.trackName === "string" ? body.trackName : "Interview",
    optionName: typeof body.optionName === "string" ? body.optionName : "Practice",
    turns,
  } as Pick<Session, "trackName" | "optionName" | "turns">;
  const difficulty = typeof body.difficulty === "string" ? body.difficulty.replace(/\s+/g, " ").trim().slice(0, 40) : "Challenging";
  const result = await callGemini(gradePrompt(session, difficulty || "Challenging"), "debrief", {
    json: true,
    maxOutputTokens: 1800,
    timeoutMs: 25000,
  });
  if (!result.res?.ok) return NextResponse.json({ graded: false });
  const data = await result.res.json();
  const grade = parseGrade(visibleModelText(data), candidate);
  if (!grade) return NextResponse.json({ graded: false });
  return NextResponse.json({ graded: true, debrief: applyGrade(body.debrief, grade) });
}
