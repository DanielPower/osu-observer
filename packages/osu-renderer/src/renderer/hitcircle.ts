import { HitResult } from "osu-classes";
import type { HitObjectConfig, SkinImages } from "../skin";
import { latestShakeOffset, outQuad, progress, tween } from "./anim";
import { drawSprite, drawTintedSprite, scaleColor, spriteSize } from "./draw";
import { drawComboNumber } from "./numbers";

/** Lazer's OsuHitWindows.MISS_WINDOW: circles are dimmed until this long before their time. */
const MISS_WINDOW = 400;
const DIM = 195 / 255;
/** Dim levels are snapped to steps so the tint cache stays small. */
const DIM_STEPS = 5;
/** Lazer's legacy_fade_duration for a hit circle's hit animation. */
const HIT_FADE = 240;
const MISS_FADE = 100;
/** Hit circle sprites are capped at twice the object's size (OBJECT_DIMENSIONS * 2). */
const MAX_CIRCLE_SIZE = 256;
const WHITE = 0xffffff;

export type CircleParams = {
  x: number;
  y: number;
  /** The object's time. */
  hitTime: number;
  /** When the circle (or slider head) was judged; undefined while it isn't yet. */
  resultTime: number | undefined;
  result: HitResult;
  shakes: number[] | undefined;
  currentTime: number;
  preempt: number;
  /** The circle's fade-in (and, under Hidden, fade-out) alpha. */
  alpha: number;
  number: number;
  color: number;
  hidden: boolean;
  /** Canvas pixels per skin pixel at this object's scale. */
  unit: number;
  config: HitObjectConfig;
  /** Draw sliderstartcircle (falling back to hitcircle) instead of hitcircle. */
  sliderHead?: boolean;
};

/** Pre-hittable dim from DrawableOsuHitObject.applyDim, as a colour multiplier. */
function dimAt(time: number, hitTime: number): number {
  const dim = tween(time, hitTime - MISS_WINDOW, 100, DIM, 1);
  return DIM + Math.round(((dim - DIM) / (1 - DIM)) * DIM_STEPS) * ((1 - DIM) / DIM_STEPS);
}

/** Whether a circle with these params still draws anything. */
export function circleVisible(time: number, resultTime: number | undefined, result: HitResult) {
  if (resultTime === undefined) return true;
  return time < resultTime + (result === HitResult.Miss ? MISS_FADE : HIT_FADE);
}

/** The hit circle (or slider head) itself, as lazer's DrawableHitCircle + LegacyMainCirclePiece. */
export function drawHitCircle(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  params: CircleParams,
): void {
  const { hitTime, resultTime, result, currentTime: time, unit, config } = params;
  const x = params.x + latestShakeOffset(params.shakes, time) * unit;
  const y = params.y;

  let alpha = params.alpha;
  let scale = 1;
  let numberAlpha = alpha;
  let numberScale = 1;
  if (resultTime !== undefined && time >= resultTime) {
    if (result === HitResult.Miss) {
      alpha *= 1 - progress(time, resultTime, MISS_FADE);
      numberAlpha = alpha;
    } else {
      const fade = 1 - progress(time, resultTime, HIT_FADE);
      scale = tween(time, resultTime, HIT_FADE, 1, 1.4, outQuad);
      alpha *= fade;
      if (config.version > 1) {
        // Version 2+ skins only fade the number, and quickly.
        numberAlpha *= 1 - progress(time, resultTime, HIT_FADE / 4);
      } else {
        numberAlpha *= fade;
        numberScale = scale;
      }
    }
  }
  if (alpha <= 0 && numberAlpha <= 0) return;

  const dim = dimAt(time, hitTime);
  const circleImage = params.sliderHead
    ? (images.sliderstartcircle ?? images.hitcircle)
    : images.hitcircle;
  // As lazer's LegacyMainCirclePiece, a skin's sliderstartcircle brings its own
  // overlay (or none); otherwise the slider head uses hitcircle's.
  const overlayImage =
    params.sliderHead && images.sliderstartcircle
      ? images.sliderstartcircleoverlay
      : images.hitcircleoverlay;

  if (circleImage) {
    const size = spriteSize(circleImage, unit * scale, MAX_CIRCLE_SIZE);
    drawTintedSprite(
      ctx,
      circleImage,
      x,
      y,
      size.width,
      size.height,
      scaleColor(params.color, dim),
      alpha,
    );
  }
  // The number sits under the overlay unless the skin says otherwise
  // (HitCircleOverlayAboveNumber, which our skins leave at its default).
  drawComboNumber(
    ctx,
    images,
    params.number,
    x,
    y,
    unit,
    config.hitCircleOverlap,
    numberAlpha,
    numberScale,
    scaleColor(WHITE, dim),
  );
  if (overlayImage) {
    const size = spriteSize(overlayImage, unit * scale, MAX_CIRCLE_SIZE);
    if (dim < 1) {
      drawTintedSprite(
        ctx,
        overlayImage,
        x,
        y,
        size.width,
        size.height,
        scaleColor(WHITE, dim),
        alpha,
      );
    } else {
      drawSprite(ctx, overlayImage, x, y, size.width, size.height, alpha);
    }
  }
}

/**
 * The approach circle, drawn above every hit object as lazer proxies it. It shrinks
 * from 4x over the preempt while fading to 0.9, and goes at the object's time (or
 * at once when the object is judged earlier).
 */
export function drawApproachCircle(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  params: CircleParams & { fadeIn: number },
): void {
  const { hitTime, resultTime, currentTime: time, preempt, unit } = params;
  if (params.hidden || !images.approachcircle) return;
  if (resultTime !== undefined && time >= resultTime) return;
  const start = hitTime - preempt;
  if (time < start) return;

  const fadeInDuration = Math.min(params.fadeIn * 2, preempt);
  let alpha = tween(time, start, fadeInDuration, 0, 0.9);
  if (time >= hitTime) {
    const atHit = tween(hitTime, start, fadeInDuration, 0, 0.9);
    alpha = tween(time, hitTime, 50, atHit, 0);
  }
  if (alpha <= 0) return;

  const scale = tween(time, start, preempt, 4, 1);
  const size = spriteSize(images.approachcircle, unit * scale, MAX_CIRCLE_SIZE);
  const x = params.x + latestShakeOffset(params.shakes, time) * unit;
  drawTintedSprite(
    ctx,
    images.approachcircle,
    x,
    params.y,
    size.width,
    size.height,
    params.color,
    alpha,
  );
}
