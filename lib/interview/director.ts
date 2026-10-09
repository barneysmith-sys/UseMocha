import { isSufficient, type Analysis } from "./analyze";
import { analyzeUtterance } from "./analyze";
import { buildDebrief } from "./debrief";
import { PRAISE, SCORE_LEAK, isProbe, normalizeQuestion } from "./guard";
import { remember } from "./memory";
import {
  CLOSE_LINE,
  INVITE,
  SMALLER_VERSION_PROBE,
  answerInRole,
  evidenceQuestion,
  experienceLine,
  openingLine,
  pressureLine,
  refusalLine,
  safeLine,
  secondProbe,
} from "./planner";
import { matchingFact, scenarioFor } from "./scenarios";
import { clampDuration, stageBudgetMs, totalMs } from "./time";
import type { Claim, Decision, DirectorAction, OpenInput, Session, StageId, Turn } from "./types";

const MAX_FOLLOW_UPS = 3;
const MAX_PROBES = 2;

export function openSession(input: OpenInput): { state: Session; decision: Decision } {
  const nowMs = input.nowMs;
  const trackId = input.trackId || "behavioral";
  const state: Session = {
    trackId,
    optionId: input.optionId || "general",
    trackName: input.trackName || trackLabel(trackId),
    optionName: input.optionName || "Interview",
    sampleQuestion: input.sampleQuestion?.trim() || "Tell me about a decision you personally made, and what changed because of it.",
    durationMin: clampDuration(input.durationMin),
    startedAtMs: nowMs,
    stage: "introduction",
    stageStartedAtMs: nowMs,
    turns: [],
    claims: [],
    claimSeq: 0,
    memory: [],
    followUpsInStage: 0,
    revealedFactIds: [],
    proposal: null,
    topic: null,
    closingInvited: false,
    closingAnswers: 0,
    closed: false,
    debrief: null,
  };
  const decision = enforceDecision(
    state,
    decisionOf(state, "OPEN_INTERVIEW", openingLine(trackId), "Open the interview in the introduction."),
    nowMs,
  );
  return { state: applyInterviewer(state, decision, nowMs), decision };
}

export function startClock(state: Session, nowMs: number): Session {
  if (state.closed) return state;
  return { ...state, startedAtMs: nowMs, stageStartedAtMs: nowMs };
}

export function closeSession(state: Session, nowMs: number): { state: Session; decision: Decision } {
  if (state.closed) {
    const decision = decisionOf(state, "CLOSE_INTERVIEW", CLOSE_LINE, "The interview has already ended.", { closed: true });
    return { state, decision };
  }
  const decision = enforceDecision(
    state,
    decisionOf(state, "CLOSE_INTERVIEW", CLOSE_LINE, "The clock ran out.", { closed: true }),
    nowMs,
  );
  return { state: applyInterviewer(state, decision, nowMs), decision };
}

export function submitAnswer(state: Session, utterance: string, nowMs: number): { state: Session; decision: Decision } {
  if (state.closed) {
    const decision = decisionOf(state, "CLOSE_INTERVIEW", CLOSE_LINE, "The interview has already ended.", { closed: true });
    return { state, decision };
  }
  const text = utterance.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!text) {
    const decision = enforceDecision(
      state,
      decisionOf(state, "CLARIFY_RESPONSE", "I didn't catch that. Start with what you did.", "Empty turn."),
      nowMs,
    );
    return { state: applyInterviewer(state, decision, nowMs), decision };
  }
  const turnId = `t${state.turns.length + 1}`;
  const withCandidate = appendCandidate(state, text, nowMs, turnId);
  const analysis = analyzeUtterance(text);
  const remembered = remember(withCandidate, text, analysis, turnId);
  const decision = enforceDecision(remembered, recommend(remembered, analysis, nowMs), nowMs);
  const next = applyInterviewer(remembered, decision, nowMs);
  return { state: next, decision };
}

export function enforceDecision(state: Session, recommended: Decision, nowMs: number): Decision {
  let decision: Decision = { ...recommended, say: recommended.say?.trim() ?? "" };
  if (!decision.say || !isAction(decision.action)) {
    decision = forcedAdvance(state, "Replaced an invalid director action.");
  }
  if (PRAISE.test(decision.say) || SCORE_LEAK.test(decision.say)) {
    decision = {
      ...decision,
      say: decision.action === "CLOSE_INTERVIEW" ? CLOSE_LINE : safeLine(state.stage),
      rationale: "Removed an evaluation from the interviewer line.",
    };
  }
  const total = totalMs(state.durationMin);
  const remaining = total - (nowMs - state.startedAtMs);
  if (decision.action === "CLOSE_INTERVIEW" && state.stage !== "closing" && remaining > total * 0.5) {
    decision = forcedAdvance(state, "Rejected a close with most of the interview still ahead.");
  }
  if (isProbe(decision.action) && state.followUpsInStage >= MAX_FOLLOW_UPS) {
    decision = forcedAdvance(state, "Follow-up limit reached for this stage.");
  }
  if (decision.action !== "CLOSE_INTERVIEW" && decision.action !== "OPEN_INTERVIEW" && isRepeat(state, decision.say)) {
    const alt = safeLine(state.stage);
    decision = {
      ...decision,
      say: isRepeat(state, alt) ? `${alt} Use a different example than the last one.` : alt,
      rationale: "Avoided repeating a question already asked.",
    };
  }
  decision.closed = decision.action === "CLOSE_INTERVIEW";
  decision.stage = decision.nextStage ?? state.stage;
  return decision;
}

function recommend(state: Session, analysis: Analysis, nowMs: number): Decision {
  const total = totalMs(state.durationMin);
  const elapsed = nowMs - state.startedAtMs;
  const remaining = total - elapsed;
  if (elapsed > total * 1.15) {
    return decisionOf(state, "CLOSE_INTERVIEW", CLOSE_LINE, "The session ran past its limit.", { closed: true });
  }
  if (remaining < 40_000 && state.stage !== "closing" && candidateCount(state) > 0) {
    return enterClosing(state, "Time left belongs to the close.");
  }
  if (analysis.asksScore && state.stage !== "closing") {
    const next = recommendStage(state, analysis, nowMs);
    if (!next.say.toLowerCase().startsWith("i'll hold")) {
      return { ...next, say: `I'll hold feedback until we've finished. ${next.say}` };
    }
    return next;
  }
  return recommendStage(state, analysis, nowMs);
}

function recommendStage(state: Session, analysis: Analysis, nowMs: number): Decision {
  const budget = stageBudgetMs(state.durationMin, state.stage);
  const overtime = nowMs - state.stageStartedAtMs > budget && candidateCount(state, state.stage) > 0;
  switch (state.stage) {
    case "introduction":
      return afterIntroduction(state, analysis);
    case "experience":
      return afterExperience(state, analysis, overtime);
    case "challenge":
      return afterChallenge(state, analysis, overtime);
    case "pressure":
      return afterPressure(state, analysis);
    case "closing":
      return afterClosing(state, analysis, overtime);
  }
}

function afterIntroduction(state: Session, analysis: Analysis): Decision {
  const claim = preferredClaim(state);
  if (claim && (claim.causalGap || claim.metric) && claim.probes < MAX_PROBES) {
    return evidence(state, claim, "The introduction named a result without the personal decision.", "experience");
  }
  const concrete = Boolean(analysis.topic) || (analysis.wordCount >= 10 && !analysis.vague);
  if (!concrete && state.followUpsInStage < 1 && !analysis.moveOn) {
    return decisionOf(
      state,
      "CLARIFY_RESPONSE",
      "What have you been working on most recently, in one concrete project?",
      "The introduction was too thin to leave.",
    );
  }
  return decisionOf(
    state,
    "ADVANCE_STAGE",
    experienceLine(state.sampleQuestion, state.topic),
    "Background is enough to enter a specific example.",
    { nextStage: "experience" },
  );
}

function afterExperience(state: Session, analysis: Analysis, overtime: boolean): Decision {
  if (analysis.moveOn) return introduce(state, "The candidate asked to move on.");
  if (analysis.smallerVersion && !alreadyAsked(state, /comfortable launching the smaller version/i)) {
    return decisionOf(state, "PROBE_DEEPER", SMALLER_VERSION_PROBE, "The decision to narrow scope needs the evidence behind it.", {
      focusClaimId: preferredClaim(state)?.id,
    });
  }
  const claim = preferredClaim(state);
  if (claim && claim.probes < 1) {
    return evidence(state, claim, "A result is on the table without enough evidence.");
  }
  if (claim && claim.probes < MAX_PROBES && !isSufficient(analysis.text, true)) {
    return decisionOf(state, "PROBE_DEEPER", secondProbe(claim), "The last answer did not yet support the claim.", {
      focusClaimId: claim.id,
    });
  }
  if (analysis.vague && state.followUpsInStage < 2 && !overtime) {
    return decisionOf(state, "PROBE_DEEPER", secondProbe(claim), "The example is still general.", {
      focusClaimId: claim?.id,
    });
  }
  return introduce(state, overtime ? "The experience stage is out of time." : "There is enough to leave this example.");
}

function afterChallenge(state: Session, analysis: Analysis, overtime: boolean): Decision {
  const scenario = scenarioFor(state.trackId);
  if (analysis.demandsSolution) {
    return decisionOf(state, "CLARIFY_RESPONSE", refusalLine(), "Refused a request to dump the case.");
  }
  const fact = matchingFact(scenario, analysis.text, state.revealedFactIds);
  if (fact && state.followUpsInStage < MAX_FOLLOW_UPS) {
    return decisionOf(state, "CLARIFY_RESPONSE", fact.text, `Reveal one case fact: ${fact.id}.`, { revealFactId: fact.id });
  }
  const assessment = scenario.assess?.(analysis.text) ?? null;
  if (assessment && state.followUpsInStage < MAX_FOLLOW_UPS && !alreadyAsked(state, exact(assessment.say))) {
    return decisionOf(state, assessment.action, assessment.say, "Scenario check against the scripted facts.");
  }
  if (!challengeReady(analysis, state) && state.followUpsInStage < 2 && !overtime) {
    return decisionOf(
      state,
      "PROBE_DEEPER",
      "Where would you look first, and what would you hold constant?",
      "The approach is not specific enough to pressure-test yet.",
    );
  }
  return decisionOf(
    state,
    "ADVANCE_STAGE",
    pressureLine(state.proposal ?? analysis.proposal, scenario.pressureFallback),
    "Move from the case into a challenge of the candidate's own recommendation.",
    { nextStage: "pressure" },
  );
}

function afterPressure(state: Session, analysis: Analysis): Decision {
  const thin = analysis.vague || analysis.wordCount < 16;
  if (thin && state.followUpsInStage < 1) {
    return decisionOf(
      state,
      "CHALLENGE_ASSUMPTION",
      "What measurement, specifically, would change the decision?",
      "The reconsideration was not concrete.",
    );
  }
  return enterClosing(state, "Pressure testing has a response.");
}

function afterClosing(state: Session, analysis: Analysis, overtime: boolean): Decision {
  if (!state.closingInvited) return enterClosing(state, "Invite questions before ending.");
  if ((analysis.asksScore || (analysis.question && !analysis.doneTalking)) && state.closingAnswers < 2 && !overtime) {
    return decisionOf(state, "CLARIFY_RESPONSE", answerInRole(state.trackId, analysis.text), "Answer inside the interview, without evaluating.");
  }
  if (!analysis.doneTalking && !analysis.question && state.followUpsInStage < 1 && state.closingAnswers === 0) {
    return decisionOf(
      state,
      "CLARIFY_RESPONSE",
      "If you have a question about the work, ask it. Otherwise we can end.",
      "Check whether the candidate wanted a question.",
    );
  }
  return decisionOf(state, "CLOSE_INTERVIEW", CLOSE_LINE, "End the interview.", { closed: true });
}

function evidence(state: Session, claim: Claim, rationale: string, nextStage?: StageId): Decision {
  const first = claim.probes < 1;
  return decisionOf(state, "REQUEST_EVIDENCE", first ? evidenceQuestion(claim) : secondProbe(claim), rationale, {
    focusClaimId: claim.id,
    nextStage,
  });
}

function introduce(state: Session, rationale: string): Decision {
  return decisionOf(state, "INTRODUCE_SCENARIO", scenarioFor(state.trackId).prompt, rationale, { nextStage: "challenge" });
}

function enterClosing(state: Session, rationale: string): Decision {
  return decisionOf(state, "ADVANCE_STAGE", INVITE, rationale, { nextStage: "closing" });
}

function forcedAdvance(state: Session, rationale: string): Decision {
  switch (state.stage) {
    case "introduction":
      return decisionOf(state, "ADVANCE_STAGE", experienceLine(state.sampleQuestion, state.topic), rationale, {
        nextStage: "experience",
      });
    case "experience":
      return introduce(state, rationale);
    case "challenge":
      return decisionOf(state, "ADVANCE_STAGE", pressureLine(state.proposal, scenarioFor(state.trackId).pressureFallback), rationale, {
        nextStage: "pressure",
      });
    case "pressure":
      return enterClosing(state, rationale);
    case "closing":
      return decisionOf(state, "CLOSE_INTERVIEW", CLOSE_LINE, rationale, { closed: true });
  }
}

function challengeReady(analysis: Analysis, state: Session): boolean {
  if (analysis.vague) return false;
  if (analysis.wordCount >= 28 && (analysis.proposal || analysis.wordCount >= 42)) return true;
  return state.revealedFactIds.length > 0 && Boolean(analysis.proposal) && analysis.wordCount >= 16;
}

function preferredClaim(state: Session): Claim | undefined {
  const open = state.claims.filter((claim) => claim.status === "open" && claim.probes < MAX_PROBES);
  return open.find((claim) => claim.causalGap || claim.metric) ?? open[0];
}

function alreadyAsked(state: Session, pattern: RegExp): boolean {
  return state.turns.some((turn) => turn.role === "interviewer" && pattern.test(turn.text));
}

function exact(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function isRepeat(state: Session, say: string): boolean {
  const norm = normalizeQuestion(say);
  if (norm.length < 24) return false;
  return state.turns.some((turn) => turn.role === "interviewer" && normalizeQuestion(turn.text) === norm);
}

function candidateCount(state: Session, stage?: StageId): number {
  return state.turns.filter((turn) => turn.role === "candidate" && (!stage || turn.stage === stage)).length;
}

function decisionOf(
  state: Session,
  action: DirectorAction,
  say: string,
  rationale: string,
  extra: Partial<Decision> = {},
): Decision {
  const nextStage = extra.nextStage;
  return {
    action,
    say,
    rationale,
    stage: nextStage ?? state.stage,
    focusClaimId: extra.focusClaimId,
    nextStage,
    revealFactId: extra.revealFactId,
    closed: extra.closed ?? action === "CLOSE_INTERVIEW",
  };
}

function applyInterviewer(state: Session, decision: Decision, nowMs: number): Session {
  const stageChanged = Boolean(decision.nextStage && decision.nextStage !== state.stage);
  const stage = decision.nextStage ?? state.stage;
  const probe = isProbe(decision.action);
  const claims = state.claims.map((claim) =>
    decision.focusClaimId && claim.id === decision.focusClaimId && probe ? { ...claim, probes: claim.probes + 1 } : claim,
  );
  const turns: Turn[] = state.turns.concat({
    id: `t${state.turns.length + 1}`,
    role: "interviewer",
    text: decision.say,
    atMs: nowMs,
    stage,
    action: decision.action,
    focusClaimId: decision.focusClaimId,
  });
  const closed = decision.action === "CLOSE_INTERVIEW";
  const next: Session = {
    ...state,
    stage,
    stageStartedAtMs: stageChanged ? nowMs : state.stageStartedAtMs,
    turns,
    claims,
    followUpsInStage: stageChanged ? (probe ? 1 : 0) : probe ? state.followUpsInStage + 1 : state.followUpsInStage,
    revealedFactIds:
      decision.revealFactId && !state.revealedFactIds.includes(decision.revealFactId)
        ? state.revealedFactIds.concat(decision.revealFactId)
        : state.revealedFactIds,
    closingInvited: state.closingInvited || decision.say === INVITE,
    closingAnswers:
      stage === "closing" && decision.action === "CLARIFY_RESPONSE" ? state.closingAnswers + 1 : state.closingAnswers,
    closed,
    debrief: null,
    lastAction: decision.action,
    lastFocusClaimId: decision.focusClaimId,
  };
  if (closed) next.debrief = buildDebrief(next);
  return next;
}

function appendCandidate(state: Session, text: string, nowMs: number, id: string): Session {
  return {
    ...state,
    turns: state.turns.concat({ id, role: "candidate", text, atMs: nowMs, stage: state.stage }),
  };
}

function isAction(value: string): value is DirectorAction {
  return (
    value === "OPEN_INTERVIEW" ||
    value === "PROBE_DEEPER" ||
    value === "REQUEST_EVIDENCE" ||
    value === "CHALLENGE_ASSUMPTION" ||
    value === "CLARIFY_RESPONSE" ||
    value === "INTRODUCE_SCENARIO" ||
    value === "ADVANCE_STAGE" ||
    value === "CLOSE_INTERVIEW"
  );
}

function trackLabel(trackId: string): string {
  const labels: Record<string, string> = {
    product: "Product Management",
    consulting: "Consulting",
    banking: "Investment Banking",
    software: "Software Engineering",
    marketing: "Marketing",
    data: "Data & Analytics",
    strategy: "Strategy & Operations",
    behavioral: "General Behavioral",
  };
  return labels[trackId] ?? "Interview";
}

export { stageBudgetMs };
