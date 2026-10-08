export const STAGES = ["introduction", "experience", "challenge", "pressure", "closing"] as const;

export type StageId = (typeof STAGES)[number];

export type DirectorAction =
  | "OPEN_INTERVIEW"
  | "PROBE_DEEPER"
  | "REQUEST_EVIDENCE"
  | "CHALLENGE_ASSUMPTION"
  | "CLARIFY_RESPONSE"
  | "INTRODUCE_SCENARIO"
  | "ADVANCE_STAGE"
  | "CLOSE_INTERVIEW";

export type Ownership = "personal" | "collective" | "unclear";

export type MemoryKind = "stated" | "inferred" | "unknown" | "contradiction";

export interface MemoryItem {
  kind: MemoryKind;
  text: string;
  turnId?: string;
}

export interface Claim {
  id: string;
  quote: string;
  ownership: Ownership;
  metric?: string;
  outcome?: string;
  causalGap: boolean;
  probes: number;
  evidence: string[];
  status: "open" | "supported" | "unresolved";
}

export interface Turn {
  id: string;
  role: "interviewer" | "candidate";
  text: string;
  atMs: number;
  stage: StageId;
  action?: DirectorAction;
  focusClaimId?: string;
}

export interface Decision {
  action: DirectorAction;
  say: string;
  stage: StageId;
  rationale: string;
  focusClaimId?: string;
  nextStage?: StageId;
  revealFactId?: string;
  closed: boolean;
}

export interface DimensionReading {
  key: "structure" | "clarity" | "ownership" | "impact";
  label: string;
  score: number;
  evidence: string[];
  note: string;
}

export interface Debrief {
  dimensions: DimensionReading[];
  stated: string[];
  inferred: string[];
  unknown: string[];
  contradictions: string[];
  summary: string;
  caseKey?: string;
}

export interface Session {
  trackId: string;
  optionId: string;
  trackName: string;
  optionName: string;
  sampleQuestion: string;
  durationMin: number;
  startedAtMs: number;
  stage: StageId;
  stageStartedAtMs: number;
  turns: Turn[];
  claims: Claim[];
  claimSeq: number;
  memory: MemoryItem[];
  followUpsInStage: number;
  revealedFactIds: string[];
  proposal: string | null;
  topic: string | null;
  closingInvited: boolean;
  closingAnswers: number;
  closed: boolean;
  debrief: Debrief | null;
  lastAction?: DirectorAction;
  lastFocusClaimId?: string;
}

export interface OpenInput {
  trackId: string;
  optionId: string;
  durationMin: number;
  nowMs: number;
  sampleQuestion?: string;
  trackName?: string;
  optionName?: string;
}
