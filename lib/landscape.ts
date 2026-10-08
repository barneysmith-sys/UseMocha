/**
 * Mutable landscape state read inside the render loop.
 * Writing it does not re-render React.
 */
export type LandscapeState = {
  nx: number;
  ny: number;
  inside: boolean;
  finePointer: boolean;
  windX: number;
  windAt: number;
  strengthTarget: number;
  focusTarget: number;
  energyTarget: number;
  pulse: number;
};

export const landscape: LandscapeState = {
  nx: 0,
  ny: 0.2,
  inside: false,
  finePointer: false,
  windX: 0,
  windAt: 0,
  strengthTarget: 0,
  focusTarget: 0,
  energyTarget: 0,
  pulse: 0,
};

export function triggerLandscapePulse() {
  landscape.pulse = 1;
}
