import type { DirectorAction } from "./types";

export const PRAISE =
  /\b(great answer|that's fantastic|that is fantastic|fantastic answer|awesome|well done|perfect answer|amazing answer|excellent answer|good job|nice work|love that)\b/i;

export const SCORE_LEAK = /\b(your score|you scored|out of 5|\/\s*5|i('|’)d rate|rating you)\b/i;

export const PROBE_ACTIONS = new Set<DirectorAction>([
  "PROBE_DEEPER",
  "REQUEST_EVIDENCE",
  "CHALLENGE_ASSUMPTION",
  "CLARIFY_RESPONSE",
]);

export function isProbe(action: DirectorAction): boolean {
  return PROBE_ACTIONS.has(action);
}

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function clampScore(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

export function trimQuote(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}
