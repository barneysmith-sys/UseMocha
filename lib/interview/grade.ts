import type { Debrief, DimensionReading, Session } from "./types";

const KEYS = ["structure", "clarity", "ownership", "impact"] as const;

export type GradedDimension = {
  key: (typeof KEYS)[number];
  score: number;
  note: string;
  evidence: string;
};

export type TranscriptGrade = {
  summary: string;
  dimensions: GradedDimension[];
};

export function gradePrompt(session: Pick<Session, "trackName" | "optionName" | "turns">, difficulty = "Challenging") {
  const transcript = session.turns
    .map((turn) => `${turn.role === "candidate" ? "Candidate" : "Interviewer"}: ${turn.text}`)
    .join("\n");
  return [
    `Score this completed ${session.trackName} interview (${session.optionName}) the way a hiring panel scores a ${difficulty} round.`,
    "Use only the Candidate lines as evidence. Interviewer lines tell you what was asked. They are not things the candidate did.",
    "Do not invent a metric, a decision, a company, a tool, or a result the candidate did not say.",
    "Do not reward length, confidence, or a tidy retelling of the question.",
    "If a dimension was not established in the candidate's own words, score it from 1.0 to 3.9 and say it was not established.",
    "Each score is from 1.0 to 10.0 with one decimal.",
    "1.0–3.9: vague, off the question, or no decision.",
    "4.0–5.9: a real situation, missing either the personal decision or a checkable result.",
    "6.0–7.9: a personal decision and a concrete detail, with one clear gap.",
    "8.0 or higher requires both a specific personal decision and a checkable result, each copied into evidence. This band is rare.",
    "structure: a listener can follow what happened first, next, and why.",
    "clarity: the nouns, actions, and constraints are specific.",
    "ownership: the candidate says what they decided. “We” without an “I decided” stays at 5.9 or below.",
    "impact: a result is stated in a form that can be checked. A feeling that it went well is not impact.",
    "evidence must be an exact short quote copied from a Candidate line, or an empty string. Never quote the interviewer.",
    "Respond with JSON only:",
    '{"summary":"","dimensions":[{"key":"structure","score":1.0,"note":"","evidence":""},{"key":"clarity","score":1.0,"note":"","evidence":""},{"key":"ownership","score":1.0,"note":"","evidence":""},{"key":"impact","score":1.0,"note":"","evidence":""}]}',
    "",
    transcript,
  ].join("\n");
}

export function parseGrade(raw: string, transcript: string): TranscriptGrade | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: { summary?: unknown; dimensions?: unknown };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.dimensions)) return null;
  const source = loose(transcript);
  const dimensions: GradedDimension[] = [];
  for (const key of KEYS) {
    const item = parsed.dimensions.find((entry) => entry && typeof entry === "object" && (entry as { key?: string }).key === key) as
      | { score?: unknown; note?: unknown; evidence?: unknown }
      | undefined;
    if (!item) return null;
    const rawScore = Number(item.score);
    if (!Number.isFinite(rawScore)) return null;
    const evidence = typeof item.evidence === "string" ? item.evidence.replace(/\s+/g, " ").trim() : "";
    const quoted = evidence && source.includes(loose(evidence)) ? evidence : "";
    let score = Math.min(10, Math.max(1, Math.round(rawScore * 10) / 10));
    if (score >= 8 && !quoted) score = 6.9;
    const note = scrubUnsupportedFigures(typeof item.note === "string" ? item.note : "", source).slice(0, 400);
    dimensions.push({
      key,
      score,
      note,
      evidence: quoted.slice(0, 220),
    });
  }
  const summary = scrubUnsupportedFigures(typeof parsed.summary === "string" ? parsed.summary : "", source).slice(0, 500);
  if (!summary) return null;
  return { summary, dimensions };
}

function loose(value: string) {
  return value
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scrubUnsupportedFigures(text: string, source: string) {
  const kept = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => {
      const figures = sentence.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
      return figures.every((figure) => source.includes(loose(figure)));
    });
  return kept.join(" ");
}

export function applyGrade(debrief: Debrief, grade: TranscriptGrade): Debrief {
  const dimensions: DimensionReading[] = debrief.dimensions.map((item) => {
    const next = grade.dimensions.find((entry) => entry.key === item.key);
    if (!next) return item;
    return {
      ...item,
      score: next.score,
      note: next.note || item.note,
      evidence: next.evidence ? [next.evidence] : [],
    };
  });
  return { ...debrief, summary: grade.summary, dimensions, mark: "transcript" };
}
