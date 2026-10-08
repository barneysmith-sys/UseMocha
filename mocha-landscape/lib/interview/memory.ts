import { analyzeUtterance, isSufficient, type Analysis, type ExtractedClaim } from "./analyze";
import { normalizeQuestion } from "./guard";
import type { Claim, MemoryItem, Session } from "./types";

export function remember(state: Session, utterance: string, analysis: Analysis, turnId: string): Session {
  const memory: MemoryItem[] = state.memory.concat([{ kind: "stated", text: utterance.trim(), turnId }]);
  const claims = state.claims.map((claim) => ({ ...claim, evidence: [...claim.evidence] }));

  if (state.lastAction && state.lastFocusClaimId && isEvidenceAction(state.lastAction)) {
    const claim = claims.find((item) => item.id === state.lastFocusClaimId);
    if (claim && claim.status === "open") {
      if (isSufficient(utterance, claim.causalGap || Boolean(claim.metric))) {
        claim.status = "supported";
        claim.evidence.push(utterance.trim());
        memory.push({
          kind: "stated",
          text: `Evidence offered for “${claim.quote}”: ${utterance.trim()}`,
          turnId,
        });
      } else if (claim.probes >= 2) {
        claim.status = "unresolved";
        memory.push({
          kind: "unknown",
          text: `Still missing support for: ${claim.quote}`,
          turnId,
        });
      }
    }
  }

  let claimSeq = state.claimSeq;
  for (const extracted of analysis.claims) {
    if (claims.some((claim) => normalizeQuestion(claim.quote) === normalizeQuestion(extracted.quote))) continue;
    claimSeq += 1;
    const claim = toClaim(extracted, `c${claimSeq}`, utterance);
    claims.push(claim);
    pushClaimMemory(memory, extracted, turnId);
  }

  noteContradictions(claims, utterance, memory, turnId);

  return {
    ...state,
    memory,
    claims,
    claimSeq,
    topic: state.topic ?? analysis.topic,
    proposal: state.stage === "challenge" && analysis.proposal ? analysis.proposal : state.proposal,
  };
}

function isEvidenceAction(action: Session["lastAction"]): boolean {
  return action === "REQUEST_EVIDENCE" || action === "PROBE_DEEPER" || action === "CHALLENGE_ASSUMPTION";
}

function toClaim(extracted: ExtractedClaim, id: string, utterance: string): Claim {
  const sufficient = isSufficient(utterance, extracted.causalGap || Boolean(extracted.metric));
  return {
    id,
    quote: extracted.quote,
    ownership: extracted.ownership,
    metric: extracted.metric,
    outcome: extracted.outcome,
    causalGap: extracted.causalGap,
    probes: 0,
    evidence: sufficient ? [utterance.trim()] : [],
    status: sufficient ? "supported" : "open",
  };
}

function pushClaimMemory(memory: MemoryItem[], extracted: ExtractedClaim, turnId: string) {
  if (extracted.causalGap) {
    const subject = extracted.outcome ? `the ${extracted.outcome} change` : "the result they described";
    memory.push({
      kind: "unknown",
      text: `Whether they personally caused ${subject}. They said: “${extracted.quote}”.`,
      turnId,
    });
  }
  if (extracted.causalGap && extracted.metric) {
    memory.push({
      kind: "inferred",
      text: `They may have had a hand in the ${extracted.metric} change, but the result was described as a team outcome, not a personal cause.`,
      turnId,
    });
  }
}

function noteContradictions(claims: Claim[], utterance: string, memory: MemoryItem[], turnId: string) {
  const lowered = utterance.toLowerCase();
  for (const claim of claims) {
    if (!claim.outcome) continue;
    const about = lowered.includes(claim.outcome);
    if (!about) continue;
    const saidUp = /\b(increased|improved|grew)\b/i.test(claim.quote);
    const nowDown = /\b(decreased|fell|dropped|declined)\b/i.test(utterance);
    const saidDown = /\b(decreased|fell|dropped|declined)\b/i.test(claim.quote);
    const nowUp = /\b(increased|improved|grew)\b/i.test(utterance);
    if ((saidUp && nowDown) || (saidDown && nowUp)) {
      memory.push({
        kind: "contradiction",
        text: `The direction of ${claim.outcome} conflicts with an earlier statement: “${claim.quote}”.`,
        turnId,
      });
    }
  }
}

export function statedTexts(memory: MemoryItem[]): string[] {
  return memory.filter((item) => item.kind === "stated").map((item) => item.text);
}

export function reanalyze(text: string): Analysis {
  return analyzeUtterance(text);
}
