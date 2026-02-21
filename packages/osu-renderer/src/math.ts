import type { HitObject } from "./simulation";

export const PLAYFIELD = {
  width: 512,
  height: 384,
  centerX: 256,
  centerY: 192,
} as const;

export const GAME = {
  width: 640,
  height: 480,
} as const;

const PREEMPT = { base: 1200, slow: 600, fast: 120 } as const;
const FADE = { base: 800, slow: 400, fast: 80 } as const;

// Spinner RPM thresholds for OD [0, 5, 10]
const SPINNER_RPM = { min: 250, mid: 380, max: 430 } as const;

export const calcPreempt = (AR: number) => {
  if (AR < 5) {
    return PREEMPT.base + (PREEMPT.slow * (5 - AR)) / 5;
  }
  if (AR > 5) {
    return PREEMPT.base - (PREEMPT.fast * (AR - 5)) / 5;
  }
  return PREEMPT.base;
};

export const calcFade = (AR: number) => {
  if (AR < 5) {
    return FADE.base + (FADE.slow * (5 - AR)) / 5;
  }
  if (AR > 5) {
    return FADE.base - (FADE.fast * (AR - 5)) / 5;
  }
  return FADE.base;
};

export function getSpinsRequired(duration: number, od: number): number {
  let requiredRPM: number;
  if (od <= 5) {
    requiredRPM =
      SPINNER_RPM.min + (SPINNER_RPM.mid - SPINNER_RPM.min) * (od / 5);
  } else {
    requiredRPM =
      SPINNER_RPM.mid + (SPINNER_RPM.max - SPINNER_RPM.mid) * ((od - 5) / 5);
  }
  const durationMinutes = duration / 60000;
  return requiredRPM * durationMinutes;
}

export const calcAlpha = (time: number, ar: number, hitObject: HitObject) =>
  Math.min(1, (time - (hitObject.time - calcPreempt(ar))) / calcFade(ar));

export function calcObjectRadius(CS: number) {
  return 32 * (1 - (0.7 * (CS - 5)) / 5);
}

export function calcCursorSize(CS: number) {
  // TODO this needs fact checking
  return 1 - (0.7 * (1 + CS - 5)) / 5;
}

export const lerp2D = (
  t0: number,
  x0: number,
  y0: number,
  t1: number,
  x1: number,
  y1: number,
  t: number,
) => {
  if (t1 === t0) return { x: x0, y: y0 };

  const alpha = (t - t0) / (t1 - t0);

  return {
    x: x0 + alpha * (x1 - x0),
    y: y0 + alpha * (y1 - y0),
  };
};
