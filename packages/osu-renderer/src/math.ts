import type { HitObject } from "osu-simulation";

export { PLAYFIELD, calcObjectRadius } from "osu-simulation";

export const GAME = {
  width: 640,
  height: 480,
} as const;

// Preempt values from lazer's OsuHitObject.cs (PREEMPT_MAX/MID/MIN):
// AR 0 → 1800ms, AR 5 → 1200ms, AR 10 → 450ms.
const PREEMPT_AT_AR_0 = 1800;
const PREEMPT_AT_AR_5 = 1200;
const PREEMPT_AT_AR_10 = 450;

// Lazer caps fade-in at 400ms and only scales it down when preempt drops
// below PREEMPT_MIN (e.g. AR > 10 via DT). See OsuHitObject.cs.
const FADE_IN_BASE = 400;

// Spinner CLEAR_RPM thresholds for OD [0, 5, 10] (lazer Spinner.cs CLEAR_RPM_RANGE).
// These determine the minimum spins required to pass a spinner.
// (The COMPLETE_RPM range 250/380/430 is used only for bonus spin calculation.)
const SPINNER_RPM = { min: 90, mid: 150, max: 225 } as const;

// Mirrors lazer's IBeatmapDifficultyInfo.DifficultyRangeInt for the preempt
// range — a piecewise linear interpolation through (0, mid, 10), floored.
export const calcPreempt = (AR: number) => {
  if (AR > 5) {
    return Math.floor(
      PREEMPT_AT_AR_5 + ((PREEMPT_AT_AR_10 - PREEMPT_AT_AR_5) * (AR - 5)) / 5,
    );
  }
  if (AR < 5) {
    return Math.floor(
      PREEMPT_AT_AR_5 - ((PREEMPT_AT_AR_5 - PREEMPT_AT_AR_0) * (5 - AR)) / 5,
    );
  }
  return PREEMPT_AT_AR_5;
};

export const calcFade = (AR: number) =>
  FADE_IN_BASE * Math.min(1, calcPreempt(AR) / PREEMPT_AT_AR_10);

/**
 * Number of full spins required to clear a spinner.
 * Matches lazer: SpinsRequired = (int)(minRps * durationSeconds + 0.0001)
 */
export function getSpinsRequired(duration: number, od: number): number {
  let requiredRPM: number;
  if (od <= 5) {
    requiredRPM =
      SPINNER_RPM.min + (SPINNER_RPM.mid - SPINNER_RPM.min) * (od / 5);
  } else {
    requiredRPM =
      SPINNER_RPM.mid + (SPINNER_RPM.max - SPINNER_RPM.mid) * ((od - 5) / 5);
  }
  const rps = requiredRPM / 60;
  const durationSeconds = duration / 1000;
  return Math.floor(rps * durationSeconds + 0.0001);
}

// Under Hidden, lazer's OsuModHidden.ApplyToBeatmap rewrites every hit
// object's TimeFadeIn to preempt * 0.4, then fades it out over preempt * 0.3
// starting the moment that adjusted fade-in completes. See OsuModHidden.cs.
export const HIDDEN_FADE_IN_MULTIPLIER = 0.4;
export const HIDDEN_FADE_OUT_MULTIPLIER = 0.3;

const fadeInDuration = (ar: number, hidden: boolean) =>
  hidden ? calcPreempt(ar) * HIDDEN_FADE_IN_MULTIPLIER : calcFade(ar);

// Fade-in only — for use as a container alpha when per-component fade-outs
// (e.g. slider body / head / tail under Hidden) are applied separately.
export const calcFadeInAlpha = (
  time: number,
  ar: number,
  hitObject: HitObject,
  hidden: boolean = false,
) => {
  const preempt = calcPreempt(ar);
  return Math.min(
    1,
    (time - (hitObject.time - preempt)) / fadeInDuration(ar, hidden),
  );
};

export const calcAlpha = (
  time: number,
  ar: number,
  hitObject: HitObject,
  hidden: boolean = false,
) => {
  const fadeIn = calcFadeInAlpha(time, ar, hitObject, hidden);
  if (!hidden) return fadeIn;

  const preempt = calcPreempt(ar);
  const fadeOutStart =
    hitObject.time - preempt + preempt * HIDDEN_FADE_IN_MULTIPLIER;
  if (time < fadeOutStart) return fadeIn;

  const fadeOutDuration = preempt * HIDDEN_FADE_OUT_MULTIPLIER;
  return Math.max(0, 1 - (time - fadeOutStart) / fadeOutDuration);
};

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
