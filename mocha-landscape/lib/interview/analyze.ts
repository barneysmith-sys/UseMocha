import { wordCount } from "./guard";
import type { Ownership } from "./types";

export interface ExtractedClaim {
  quote: string;
  ownership: Ownership;
  metric?: string;
  outcome?: string;
  causalGap: boolean;
}

export interface Analysis {
  text: string;
  wordCount: number;
  vague: boolean;
  question: boolean;
  moveOn: boolean;
  demandsSolution: boolean;
  asksScore: boolean;
  doneTalking: boolean;
  smallerVersion: boolean;
  claims: ExtractedClaim[];
  proposal: string | null;
  topic: string | null;
}

const VAGUE =
  /\b(stuff|things|various|kind of|kinda|sort of|sorta|a lot of|somehow|good stuff|we just|it worked|and so on)\b/i;
const METRIC = /(\d+(?:\.\d+)?%|\$\d[\d,]*(?:\s*(?:million|billion|k))?|\d+(?:\.\d+)?x)/i;
const OUTCOME =
  /\b(retention|revenue|profit|profitability|activation|conversion|latency|growth|margin|churn|uptime)\b/i;
const RESULT_VERB = /\b(increased|improved|grew|reduced|decreased|cut|fell|dropped)\b/i;

export function analyzeUtterance(raw: string): Analysis {
  const text = raw.replace(/\s+/g, " ").trim();
  const words = wordCount(text);
  return {
    text,
    wordCount: words,
    vague: isVague(text, words),
    question: isQuestion(text),
    moveOn: /\b(move on|next question|skip this|let's move on|lets move on)\b/i.test(text),
    demandsSolution: /ignore (your|these|all) instructions|full case solution|tell me the answer|give me the answer|all the (numbers|facts)/i.test(text),
    asksScore: /\b(how am i doing|how did i do|what'?s my score|rate me|my feedback)\b/i.test(text),
    doneTalking:
      /^(no|nope|nothing|that'?s all|i'?m good|im good|all set|thank you|thanks)[.!]?$/i.test(text) ||
      /\b(no questions|that'?s all|nothing else|i'?m all set)\b/i.test(text),
    smallerVersion:
      /smaller version|mvp|pilot|incomplete information|didn'?t have enough data|did not have enough data|not enough data/i.test(
        text,
      ),
    claims: extractClaims(text),
    proposal: extractProposal(text),
    topic: extractTopic(text),
  };
}

export function isVague(text: string, words = wordCount(text)): boolean {
  if (words === 0) return true;
  if (words < 12) return true;
  const hits = text.match(new RegExp(VAGUE.source, "gi"))?.length ?? 0;
  const grounded = /\d/.test(text) || /\bbecause\b/i.test(text);
  return hits >= 1 && words < 30 && !grounded;
}

export function isSufficient(text: string, needsEvidence: boolean): boolean {
  const words = wordCount(text);
  if (words < 16) return false;
  if (isVague(text, words) && words < 36) return false;
  const specific =
    /\b(because|so that|i decided|i chose|i cut|i shipped|i told|i replaced|i killed|the decision|evidence|cohort|data showed|percent)\b/i.test(
      text,
    ) || /\d/.test(text);
  if (needsEvidence) return specific && words >= 18;
  return (words >= 22 && specific) || (words >= 40 && !isVague(text, words));
}

function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  return /\?\s*$/.test(trimmed) || /^(how|what|why|when|who|where|can i|could i|do you|would you|is there|should i)\b/i.test(trimmed);
}

function extractClaims(text: string): ExtractedClaim[] {
  const parts = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const sentences = parts.length > 0 ? parts : [text];
  const claims: ExtractedClaim[] = [];
  for (const sentence of sentences) {
    const metric = sentence.match(METRIC)?.[1];
    const outcome = sentence.match(OUTCOME)?.[1]?.toLowerCase();
    const action = RESULT_VERB.test(sentence) || /\b(led|launched|shipped|built|designed|decided|owned)\b/i.test(sentence);
    if (!action && !metric) continue;
    const ledPersonally = /\bI\s+(led|decided|chose|built|designed|owned|shipped|launched|cut|told|proposed|replaced|killed)\b/.test(
      sentence,
    );
    const collective = /\b(we|our team|the team)\b/i.test(sentence);
    let ownership: Ownership = "unclear";
    if (ledPersonally) ownership = "personal";
    else if (collective && !/\bI\b/.test(sentence)) ownership = "collective";
    else if (/\bI\b/.test(sentence)) ownership = "personal";
    else if (collective) ownership = "collective";
    const teamDidTheResult = /\b(team|we)\b[^.]{0,48}\b(increased|improved|grew|reduced|decreased)\b/i.test(sentence);
    const personalResult = /\bI\s+(increased|improved|grew|reduced|drove|caused|delivered)\b/i.test(sentence);
    const causalGap = Boolean(outcome && RESULT_VERB.test(sentence) && (collective || teamDidTheResult) && !personalResult);
    claims.push({
      quote: sentence,
      ownership,
      metric,
      outcome,
      causalGap: causalGap || Boolean(teamDidTheResult && metric),
    });
  }
  return claims;
}

function extractProposal(text: string): string | null {
  const match = text.match(
    /\b(?:I(?:'d| would)|I will|my recommendation is to|I recommend|I propose|we should)\s+([^.]{8,160})/i,
  );
  if (!match) return null;
  return match[1].trim();
}

function extractTopic(text: string): string | null {
  const pattern = /\b(?:working on|worked on|building|mostly on|focused on)\s+([A-Za-z][^.,!?]{2,48})/gi;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = pattern.exec(text))) last = match[1];
  if (!last) return null;
  const topic = last.replace(/\b(the|a|an|my|our)\b/gi, "").replace(/\s+/g, " ").trim();
  const words = topic.split(" ").slice(0, 5).join(" ");
  if (words.length < 3) return null;
  return words;
}

export function cleanProposal(raw: string): string {
  return raw.replace(/^(to|that we|that I)\s+/i, "").replace(/[.]+$/g, "").trim();
}
