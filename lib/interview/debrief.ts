import { isVague } from "./analyze";
import { clampScore, trimQuote } from "./guard";
import { scenarioFor } from "./scenarios";
import type { Debrief, DimensionReading, Session } from "./types";

export function buildDebrief(state: Session): Debrief {
  const candidate = state.turns.filter((turn) => turn.role === "candidate").map((turn) => turn.text);
  const vagueCount = candidate.filter((text) => isVague(text)).length;
  const structured = candidate.filter((text) =>
    /\b(first|then|because|the tradeoff|i would start|i decided|on the)\b/i.test(text),
  ).length;
  const personal = state.claims.filter((claim) => claim.ownership === "personal");
  const supported = state.claims.filter((claim) => claim.status === "supported");
  const metrics = state.claims.filter((claim) => claim.metric);
  const supportedMetrics = metrics.filter((claim) => claim.status === "supported");

  const structure = clampScore(2 + structured - Math.floor(vagueCount / 2));
  const clarity = clampScore(5 - vagueCount);
  const ownership = clampScore(
    supported.some((claim) => claim.ownership === "personal") ? 5 : personal.length > 0 ? 3 : state.claims.some((c) => c.ownership === "collective") ? 2 : 2,
  );
  const impact = clampScore(supportedMetrics.length > 0 ? 5 : metrics.length > 0 ? 3 : supported.length > 0 ? 3 : 2);

  const used = new Set<string>();
  const take = (pred: (text: string) => boolean, preferred?: string): string[] => {
    const pool = preferred ? [preferred, ...candidate] : candidate;
    const found = pool.find((text) => text && pred(text) && !used.has(text)) ?? pool.find((text) => text && !used.has(text));
    if (!found) return [];
    used.add(found);
    return [trimQuote(found)];
  };

  const dimensions: DimensionReading[] = [
    {
      key: "structure",
      label: "Structure",
      score: structure,
      evidence: take((text) => /\b(first|then|because|i would start)\b/i.test(text)),
      note:
        structured > 0
          ? "The transcript has an order: a start, a reason, or a sequence."
          : "The answers rarely showed what came first, or why.",
    },
    {
      key: "clarity",
      label: "Clarity",
      score: clarity,
      evidence: take((text) => !isVague(text) && text.length > 40),
      note:
        vagueCount > 0
          ? `${vagueCount} answer${vagueCount === 1 ? "" : "s"} stayed general, without a concrete decision or figure.`
          : "The answers named specific actions instead of general effort.",
    },
    {
      key: "ownership",
      label: "Ownership",
      score: ownership,
      evidence: take((text) => /\bI\b/.test(text), personal[0]?.quote),
      note: ownershipNote(state),
    },
    {
      key: "impact",
      label: "Impact",
      score: impact,
      evidence: metrics[0] ? take(() => true, metrics[0].quote) : [],
      note: impactNote(state),
    },
  ];

  const unknowns = state.memory.filter((item) => item.kind === "unknown").map((item) => item.text);
  const inferred = state.memory.filter((item) => item.kind === "inferred").map((item) => item.text);
  const contradictions = state.memory.filter((item) => item.kind === "contradiction").map((item) => item.text);
  const stated = state.memory
    .filter((item) => item.kind === "stated" && !item.text.startsWith("Evidence offered"))
    .map((item) => trimQuote(item.text, 220));

  const openUnknown = unknowns[0];
  const summary = openUnknown
    ? `The interview has a record of what was said. Still open: ${openUnknown}`
    : supported[0]
      ? `The strongest supported point was: ${trimQuote(supported[0].evidence[0] ?? supported[0].quote, 160)}`
      : "The interview closed with thin evidence. The useful next practice is one decision, in the first person, with the reason it was made.";

  const scenario = scenarioFor(state.trackId);
  return {
    dimensions,
    stated,
    inferred,
    unknown: unknowns,
    contradictions,
    summary,
    caseKey: scenario.caseKey,
  };
}

function ownershipNote(state: Session): string {
  const gap = state.claims.find((claim) => claim.causalGap && claim.status !== "supported");
  if (gap) {
    return "A result was described. The conversation did not establish that you personally caused it.";
  }
  const supported = state.claims.find((claim) => claim.ownership === "personal" && claim.status === "supported");
  if (supported) return "There is a decision in the first person, with something offered as evidence.";
  if (state.claims.some((claim) => claim.ownership === "collective")) {
    return "The story stayed with “we.” The interview never isolated a decision that was yours.";
  }
  return "Ownership was hard to score because few claims were specific enough to test.";
}

function impactNote(state: Session): string {
  const metric = state.claims.find((claim) => claim.metric);
  if (!metric) return "No result was tied to a figure the interviewer could test.";
  if (metric.status === "supported") return `The ${metric.metric} figure was followed by a specific decision.`;
  return `You cited ${metric.metric}. The conversation did not pin down what you did to produce it.`;
}
