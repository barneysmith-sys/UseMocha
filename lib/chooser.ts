import { findTrack } from "./careers";

export const DIFFICULTIES = ["Standard", "Challenging", "Final round"] as const;
export const DURATIONS = [15, 30, 45] as const;
export const RESPOND_MODES = ["Voice", "Text"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];
export type DurationMin = (typeof DURATIONS)[number];
export type RespondMode = (typeof RESPOND_MODES)[number];

export type InterviewType = {
  label: string;
  optionId: string;
};

export const TRACK_BLURB: Record<string, string> = {
  consulting: "Case · Fit · Market sizing",
  banking: "Technical · Fit · Deal discussion",
  product: "Product sense · Execution · Behavioral",
  software: "Behavioral · Project deep-dive",
  marketing: "Growth case · Campaign · Behavioral",
  data: "Metrics · Analytical case · Behavioral",
  strategy: "Ops case · Prioritization · Behavioral",
  behavioral: "Leadership · Conflict · Ambiguity",
};

const ALIASES: Record<string, string[]> = {
  consulting: ["case", "mckinsey", "fit"],
  banking: ["finance", "ib", "investment", "superday"],
  product: ["pm", "design", "product sense"],
  software: ["swe", "engineer", "engineering", "coding"],
  marketing: ["growth", "brand"],
  data: ["analytics", "metrics"],
  strategy: ["ops", "operations", "strategy"],
  behavioral: ["behaviour", "general", "leadership"],
};

export const INTERVIEW_TYPES: Record<string, InterviewType[]> = {
  consulting: [
    { label: "Case", optionId: "ambiguous-structure" },
    { label: "Fit", optionId: "mckinsey-style" },
    { label: "Full loop", optionId: "resistance" },
  ],
  banking: [
    { label: "Technical", optionId: "defend-a-number" },
    { label: "Fit", optionId: "analyst-recruiting" },
    { label: "Superday", optionId: "late-error" },
  ],
  product: [
    { label: "Behavioral", optionId: "stakeholder-no" },
    { label: "Product sense", optionId: "product-design" },
    { label: "Execution", optionId: "metric" },
    { label: "Full loop", optionId: "product-design" },
  ],
  software: [
    { label: "Behavioral", optionId: "ownership" },
    { label: "Project deep-dive", optionId: "failure" },
  ],
  marketing: [
    { label: "Growth case", optionId: "underperformed" },
    { label: "Campaign", optionId: "best-result" },
    { label: "Behavioral", optionId: "overruled" },
  ],
  data: [
    { label: "Metrics", optionId: "analysis" },
    { label: "Analytical case", optionId: "risk" },
    { label: "Behavioral", optionId: "wrong-assumption" },
  ],
  strategy: [
    { label: "Ops case", optionId: "incomplete" },
    { label: "Behavioral", optionId: "alignment" },
  ],
  behavioral: [
    { label: "Standard", optionId: "conflict" },
    { label: "Leadership", optionId: "leadership-general" },
  ],
};

export const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  Standard: "a steady pace, with room to develop the answer",
  Challenging: "more follow-ups, less time to think",
  "Final round": "senior pressure on the decisions you own",
};

export type Selection = {
  trackId: string;
  optionId: string;
  format: string;
  difficulty: Difficulty;
  minutes: DurationMin;
  mode: RespondMode;
};

export const DEFAULT_SELECTION: Selection = {
  trackId: "product",
  optionId: "product-design",
  format: "Product sense",
  difficulty: "Challenging",
  minutes: 30,
  mode: "Voice",
};

export function typesFor(trackId: string) {
  return INTERVIEW_TYPES[trackId] ?? [];
}

export function isDifficulty(value: string | null): value is Difficulty {
  return DIFFICULTIES.includes(value as Difficulty);
}

export function isDuration(value: number): value is DurationMin {
  return DURATIONS.includes(value as DurationMin);
}

export function trackMatches(trackId: string, name: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const blob = [name, TRACK_BLURB[trackId] ?? "", ...(ALIASES[trackId] ?? []), ...typesFor(trackId).map((type) => type.label)]
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

export function splitMatch(label: string, query: string) {
  const q = query.trim();
  if (!q) return { pre: label, hit: "", post: "" };
  const index = label.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return { pre: label, hit: "", post: "" };
  return {
    pre: label.slice(0, index),
    hit: label.slice(index, index + q.length),
    post: label.slice(index + q.length),
  };
}

export function selectionFromSearch(params: URLSearchParams): Selection | null {
  const trackId = params.get("track");
  if (!trackId || !findTrack(trackId)) return null;
  const types = typesFor(trackId);
  const format = params.get("format");
  const chosen =
    types.find((type) => type.label === format) ??
    types.find((type) => type.optionId === params.get("option")) ??
    types[0];
  if (!chosen) return null;
  const minutes = Number(params.get("minutes"));
  const difficulty = params.get("difficulty");
  const mode = params.get("mode");
  return {
    trackId,
    optionId: chosen.optionId,
    format: chosen.label,
    minutes: isDuration(minutes) ? minutes : DEFAULT_SELECTION.minutes,
    difficulty: isDifficulty(difficulty) ? difficulty : DEFAULT_SELECTION.difficulty,
    mode: mode === "text" ? "Text" : "Voice",
  };
}

export function setupQuery(selection: Selection, extra?: { role?: string; company?: string }) {
  const params = new URLSearchParams({
    track: selection.trackId,
    option: selection.optionId,
    minutes: String(selection.minutes),
    mode: selection.mode === "Text" ? "text" : "voice",
    difficulty: selection.difficulty,
    format: selection.format,
  });
  const role = extra?.role?.trim();
  const company = extra?.company?.trim();
  if (role) params.set("role", role);
  if (company) params.set("company", company);
  return params;
}
