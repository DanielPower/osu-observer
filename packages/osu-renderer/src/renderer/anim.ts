// Easings and transform helpers matching osu!framework's, so hit object
// animations can be ported from lazer as written.

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;
/** osu!framework's Easing.Out (and OutQuad). */
export const outQuad: Easing = (t) => t * (2 - t);
/** osu!framework's Easing.In (and InQuad). */
export const inQuad: Easing = (t) => t * t;
export const outQuint: Easing = (t) => 1 - (1 - t) ** 5;
export const inQuint: Easing = (t) => t ** 5;
export const outSine: Easing = (t) => Math.sin((t * Math.PI) / 2);
export const inSine: Easing = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const inOutSine: Easing = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const ELASTIC_CONST = (2 * Math.PI) / 0.3;
const ELASTIC_OFFSET_HALF = 2 ** -10 * Math.sin((0.5 - 0.075) * ELASTIC_CONST);
/** osu!framework's Easing.OutElasticHalf. */
export const outElasticHalf: Easing = (t) =>
  2 ** (-10 * t) * Math.sin((0.5 * t - 0.075) * ELASTIC_CONST) + 1 - ELASTIC_OFFSET_HALF * t;

/** Progress (0..1) of a transform that runs from `start` for `duration` ms, eased. */
export function progress(time: number, start: number, duration: number, easing = linear): number {
  if (time <= start) return duration <= 0 && time >= start ? 1 : 0;
  if (duration <= 0 || time >= start + duration) return 1;
  return easing((time - start) / duration);
}

/** The value of a transform from `from` to `to`, starting at `start` for `duration` ms. */
export function tween(
  time: number,
  start: number,
  duration: number,
  from: number,
  to: number,
  easing = linear,
): number {
  return from + (to - from) * progress(time, start, duration, easing);
}

/**
 * A property animated by a series of transforms. Each transform starts from the
 * value the property has when it begins, as osu!framework's do, so a later
 * transform interrupts an earlier one.
 */
export class Animated {
  private segments: {
    start: number;
    duration: number;
    from: number;
    to: number;
    easing: Easing;
  }[] = [];

  private readonly initial: number;

  constructor(initial: number) {
    this.initial = initial;
  }

  /** Jump to `value` at `time`. */
  set(time: number, value: number): this {
    return this.to(time, 0, value);
  }

  /** Animate to `value` from `time` over `duration`, from the value at `time`. */
  to(time: number, duration: number, value: number, easing = linear): this {
    const from = this.at(time);
    // Transforms starting after this one are dropped; it overrides any before it.
    this.segments = this.segments.filter((s) => s.start <= time);
    this.segments.push({ start: time, duration, from, to: value, easing });
    return this;
  }

  at(time: number): number {
    let value = this.initial;
    for (const s of this.segments) {
      if (time < s.start) break;
      value = s.from + (s.to - s.from) * progress(time, s.start, s.duration, s.easing);
    }
    return value;
  }
}

const SHAKE_MAGNITUDE = 8;

/**
 * Horizontal offset of a lazer ShakeContainer with ShakeDuration 30 (hit circles and
 * sliders), `elapsed` ms after Shake(): two full swings of SHAKE_MAGNITUDE units.
 * See DrawableExtensions.Shake.
 */
export function shakeOffset(elapsed: number, duration = 30): number {
  if (elapsed < 0 || elapsed >= duration * 4) return 0;
  const m = SHAKE_MAGNITUDE;
  const half = duration / 2;
  if (elapsed < half) return tween(elapsed, 0, half, 0, m, outSine);
  if (elapsed < half + duration) return tween(elapsed, half, duration, m, -m, inOutSine);
  if (elapsed < half + duration * 2)
    return tween(elapsed, half + duration, duration, -m, m, inOutSine);
  if (elapsed < half + duration * 3)
    return tween(elapsed, half + duration * 2, duration, m, -m, inOutSine);
  return tween(elapsed, half + duration * 3, half, -m, 0, inSine);
}

/** Offset for the latest of `shakes` (times) at or before `time`. */
export function latestShakeOffset(shakes: number[] | undefined, time: number): number {
  if (!shakes) return 0;
  for (let i = shakes.length - 1; i >= 0; i--) {
    if (shakes[i] <= time) return shakeOffset(time - shakes[i]);
  }
  return 0;
}
