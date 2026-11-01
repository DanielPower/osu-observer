import { HitResult } from "osu-classes";
import type { SkinImages } from "../skin";
import { Animated, inQuad, outQuad, tween } from "./anim";
import { drawTintedSprite, spriteSize } from "./draw";

// LegacyJudgementPieceOld's timings.
const FADE_IN = 120;
const FADE_OUT_DELAY = 500;
const FADE_OUT = 600;
/** How long a judgement stays on screen. */
export const JUDGEMENT_DURATION = FADE_OUT_DELAY + FADE_OUT;
/** How long hit lighting stays on screen. */
export const LIGHTING_DURATION = 1400;
const MAX_MISS_ROTATION = (8.6 * Math.PI) / 180;

export type JudgementEntry = {
  time: number;
  result: HitResult;
  x: number;
  y: number;
  /** The judged object's combo colour, for hit lighting. */
  color: number;
};

function resultImage(images: SkinImages, result: HitResult): ImageBitmap | undefined {
  switch (result) {
    case HitResult.Great:
    case HitResult.Perfect:
      return images.hit300;
    case HitResult.Good:
    case HitResult.Ok:
      return images.hit100;
    case HitResult.Meh:
      return images.hit50;
    case HitResult.Miss:
      return images.hit0;
    case HitResult.IgnoreMiss:
      return images.sliderendmiss;
    case HitResult.LargeTickMiss:
      return images.slidertickmiss;
    default:
      return undefined;
  }
}

const isTickMiss = (result: HitResult) =>
  result === HitResult.IgnoreMiss || result === HitResult.LargeTickMiss;

/** A stable pseudo-random value in [-1, 1) per judgement, so scrubbing doesn't change it. */
function randomFor(entry: JudgementEntry): number {
  let h = Math.imul(Math.round(entry.time * 16) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 0x100000000) * 2 - 1;
}

/**
 * A judgement as lazer's LegacyJudgementPieceOld animates it. `unit` is canvas
 * pixels per skin pixel at the object's scale.
 */
export function drawJudgement(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  entry: JudgementEntry,
  time: number,
  unit: number,
  skinVersion: number,
): void {
  const elapsed = time - entry.time;
  if (elapsed < 0 || elapsed > JUDGEMENT_DURATION) return;
  const img = resultImage(images, entry.result);
  if (!img) return;

  const alpha = new Animated(0).to(0, FADE_IN, 1);
  if (isTickMiss(entry.result)) alpha.to(FADE_OUT_DELAY / 2, FADE_OUT, 0);
  alpha.to(FADE_OUT_DELAY, FADE_OUT, 0);

  let scale: number;
  let offsetY = 0;
  let rotation = 0;
  if (isTickMiss(entry.result)) {
    scale = tween(elapsed, 0, 100, 1.2, 1, inQuad);
  } else if (entry.result === HitResult.Miss) {
    scale = tween(elapsed, 0, 100, 1.6, 1, inQuad);
    if (skinVersion > 1) offsetY = tween(elapsed, 0, JUDGEMENT_DURATION, -5, 75, inQuad);
    const angle = randomFor(entry) * MAX_MISS_ROTATION;
    rotation =
      elapsed < FADE_IN
        ? tween(elapsed, 0, FADE_IN, 0, angle)
        : tween(elapsed, FADE_IN, JUDGEMENT_DURATION - FADE_IN, angle, angle * 2, inQuad);
  } else {
    scale = new Animated(0.6)
      .to(0, FADE_IN * 0.8, 1.1)
      .to(FADE_IN, FADE_IN * 0.2, 0.9)
      .set(FADE_IN * 1.2, 0.95)
      .to(FADE_IN * 1.2, FADE_IN * 0.2, 1)
      .at(elapsed);
  }

  const a = alpha.at(elapsed);
  if (a <= 0) return;
  const size = spriteSize(img, unit * scale);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(entry.x, entry.y + offsetY * unit);
  ctx.rotate(rotation);
  ctx.drawImage(img, -size.width / 2, -size.height / 2, size.width, size.height);
  ctx.restore();
}

/** Whether a result gets hit lighting: hits of whole objects, not ticks or misses. */
export function hasLighting(result: HitResult): boolean {
  return (
    result === HitResult.Great ||
    result === HitResult.Perfect ||
    result === HitResult.Good ||
    result === HitResult.Ok ||
    result === HitResult.Meh
  );
}

/**
 * The skin's lighting behind a hit, additive in the object's combo colour, as
 * lazer's DrawableOsuJudgement.ApplyHitAnimations.
 */
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  entry: JudgementEntry,
  time: number,
  unit: number,
): void {
  const elapsed = time - entry.time;
  if (!images.lighting || elapsed < 0 || elapsed > LIGHTING_DURATION) return;
  if (!hasLighting(entry.result)) return;

  const alpha =
    elapsed < 200
      ? elapsed / 200
      : elapsed < 400
        ? 1
        : 1 - (elapsed - 400) / (LIGHTING_DURATION - 400);
  const scale = tween(elapsed, 0, 600, 0.8, 1.2, outQuad);
  const size = spriteSize(images.lighting, unit * scale);
  const previous = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  drawTintedSprite(
    ctx,
    images.lighting,
    entry.x,
    entry.y,
    size.width,
    size.height,
    entry.color,
    alpha,
  );
  ctx.globalCompositeOperation = previous;
}
