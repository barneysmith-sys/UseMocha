import type { Claim, StageId } from "./types";
import { cleanProposal } from "./analyze";

const OPENERS: Record<string, string> = {
  product:
    "Thanks for joining today. I'd like to start by learning a little about your background and what interested you in product management.",
  consulting:
    "Thanks for joining today. I'd like to start with your background, and what drew you toward consulting.",
  banking:
    "Thanks for joining today. I'd like to start with your background, and what interested you in banking.",
  software:
    "Thanks for joining today. I'd like to start with your background, and what interested you in software engineering.",
  marketing:
    "Thanks for joining today. I'd like to start with your background, and what interested you in marketing.",
  data: "Thanks for joining today. I'd like to start with your background, and what interested you in data work.",
  strategy:
    "Thanks for joining today. I'd like to start with your background, and what interested you in strategy.",
  behavioral:
    "Thanks for joining today. I'd like to start with your background, and the kind of work you want to do next.",
};

const BRIEFS: Record<string, { team: string; success: string; day: string; fallback: string }> = {
  product: {
    team: "You would be with a small product group: a designer, a few engineers, and a manager who expects you to own the recommendation.",
    success:
      "A good first stretch is a shipped change with a before and after on one metric, and a clear account of what you chose not to build.",
    day: "Most days mix user conversations, a working session with engineering, and a written decision someone can disagree with.",
    fallback: "The work is ambiguous, and the person in the seat owns the recommendation. What else would you like to know?",
  },
  consulting: {
    team: "The team on a study is small: a manager, one or two other people, and a client who did not ask for a deck so much as a decision.",
    success: "A good start is a recommendation the client can act on, with the assumptions stated in a way they can challenge.",
    day: "The day is interviews, a working session on the structure, and a point of view written before it is polished.",
    fallback: "The job is to structure an unclear problem and say what you would do. What else would you like to know?",
  },
  banking: {
    team: "You would sit with a coverage or product group, a staffer, and associates who expect the numbers to be defensible.",
    success: "A good first months is clean work under a deadline, and a mistake caught before it leaves the group.",
    day: "Days run long around a live process: a model, comments, and a page someone senior will ask you to walk back.",
    fallback: "Precision matters more than polish. What else would you like to know about the work?",
  },
  software: {
    team: "You would be on a small engineering team that owns a service in production, with an on-call rotation.",
    success: "A good start is a change you can explain in production: what it does, how it fails, and what you measured.",
    day: "Most days are design, review, and the operational detail of something already running.",
    fallback: "The bar is a system you can operate, not a diagram. What else would you like to know?",
  },
  marketing: {
    team: "You would work with a channel owner, a creative partner, and someone who holds the number you are trying to move.",
    success: "A good stretch is a campaign you can explain with the metric you chose and the one you refused to chase.",
    day: "Days are briefs, a read of what the last flight actually did, and a decision about the next one.",
    fallback: "The work is a bet with a measurement plan. What else would you like to know?",
  },
  data: {
    team: "You would sit with the people who use the model, not only the people who train it.",
    success: "A good start is an analysis that changed a threshold or a decision, with the limitation written down.",
    day: "Days are data checks, a conversation with the operator, and a recommendation that says what you do not know.",
    fallback: "The job is to change a decision, and to say what the data cannot support. What else would you like to know?",
  },
  strategy: {
    team: "You would work with an operator who has to live with the recommendation after the memo is done.",
    success: "A good stretch is a choice, the option you rejected, and the sign that would tell you the choice was wrong.",
    day: "Days are conversations with the business, a structure, and a recommendation someone can disagree with.",
    fallback: "The work is a decision under incomplete information. What else would you like to know?",
  },
  behavioral: {
    team: "The setting is a small team where your decision is visible to the people who have to carry it out.",
    success: "A good example is a hard conversation you had in specific words, and what changed afterward.",
    day: "The day is the work itself, plus the moment you have to tell someone something they do not want to hear.",
    fallback: "I can talk about the work, not about how this practice round is scored. What else would you like to know?",
  },
};

export const INVITE = "Before we finish, what questions do you have for me?";

export const CLOSE_LINE = "That's all the time we have. Thank you for the conversation — we'll end here.";

export function openingLine(trackId: string): string {
  return OPENERS[trackId] ?? OPENERS.behavioral;
}

export function experienceLine(sampleQuestion: string, topic: string | null): string {
  const question = sampleQuestion.trim() || "Tell me about a decision you personally made, and what changed because of it.";
  if (!topic) return question;
  if (question.toLowerCase().includes(topic.toLowerCase())) return question;
  const led = question.charAt(0).toUpperCase() + question.slice(1);
  return `You mentioned ${topic}. ${led}`;
}

export function evidenceQuestion(claim: Claim): string {
  if (claim.metric) {
    const direction = /\b(increased|improved|grew)\b/i.test(claim.quote) ? "improvement" : "change";
    return `What specific decisions did you personally make that contributed to that ${claim.metric} ${direction}?`;
  }
  if (claim.outcome && claim.causalGap) {
    return `You mentioned ${claim.outcome}. What did you personally do that connects you to that result?`;
  }
  if (claim.causalGap) {
    return "What did you personally do that connects you to that result?";
  }
  return "What did you personally decide, and what evidence did you have at the time?";
}

export function secondProbe(claim: Claim | undefined): string {
  if (claim?.metric) {
    return "Name one decision that was yours alone, and the evidence you had when you made it.";
  }
  if (claim?.causalGap) {
    return "Separate what the team did from what you did. Which part was yours?";
  }
  return "What did you decide, and what did you choose not to do?";
}

export const SMALLER_VERSION_PROBE =
  "What specific evidence made you comfortable launching the smaller version, and what would have convinced you to delay?";

export function pressureLine(proposal: string | null, fallback: string): string {
  if (!proposal) return fallback;
  const cleaned = cleanProposal(proposal);
  if (cleaned.length < 8 || cleaned.length > 160) return fallback;
  const phrase = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  const first = phrase.split(" ")[0] ?? "";
  if (/ing$/.test(first)) {
    return `You've proposed ${phrase}. What evidence would make you reconsider that decision?`;
  }
  return `You've proposed to ${phrase}. What evidence would make you reconsider that decision?`;
}

export function answerInRole(trackId: string, question: string): string {
  const brief = BRIEFS[trackId] ?? BRIEFS.behavioral;
  if (/\b(how am i|how did i|score|rate me|feedback)\b/i.test(question)) {
    return "I'll hold feedback until we've finished. If you have a question about the work, ask it.";
  }
  let body = brief.fallback;
  if (/\b(team|manager|report|who would|who will)\b/i.test(question)) body = brief.team;
  else if (/\b(success|good look|expect|six months|first year)\b/i.test(question)) body = brief.success;
  else if (/\b(day|daily|typical)\b/i.test(question)) body = brief.day;
  else if (/\b(hire|offer|next step|hear back|get the job)\b/i.test(question)) {
    body = "This is a practice round, so there isn't a hiring decision afterward. We can talk about the work itself.";
  }
  return `${body} What else would you like to know?`;
}

export function safeLine(stage: StageId): string {
  switch (stage) {
    case "introduction":
      return "What have you been working on most recently?";
    case "experience":
      return "What did you personally decide, and what evidence did you have at the time?";
    case "challenge":
      return "What would you look at first, and what would you hold constant?";
    case "pressure":
      return "What evidence would make you reconsider that decision?";
    case "closing":
      return INVITE;
  }
}

export function refusalLine(): string {
  return "I'm not going to walk the answer. Use the facts you have, and tell me the next step you would take.";
}
