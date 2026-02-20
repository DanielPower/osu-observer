import type { HitObject } from "./simulation";

export const calcPreempt = (AR: number) => {
  if (AR < 5) {
    return 1200 + (600 * (5 - AR)) / 5;
  }
  if (AR > 5) {
    return 1200 - (120 * (AR - 5)) / 5;
  }
  return 1200;
};

export const calcFade = (AR: number) => {
  if (AR < 5) {
    return 800 + (400 * (5 - AR)) / 5;
  }
  if (AR > 5) {
    return 800 - (80 * (AR - 5)) / 5;
  }
  return 800;
};

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
