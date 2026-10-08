import { STAGES, type StageId } from "./types";

export const STAGE_WEIGHTS: Record<StageId, number> = {
  introduction: 2,
  experience: 4,
  challenge: 7,
  pressure: 5,
  closing: 2,
};

export const WEIGHT_SUM = STAGES.reduce((sum, stage) => sum + STAGE_WEIGHTS[stage], 0);

export function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return 20;
  return Math.min(45, Math.max(6, Math.round(minutes)));
}

export function stageBudgetMs(durationMin: number, stage: StageId): number {
  return Math.round((clampDuration(durationMin) * 60_000 * STAGE_WEIGHTS[stage]) / WEIGHT_SUM);
}

export function totalMs(durationMin: number): number {
  return clampDuration(durationMin) * 60_000;
}
