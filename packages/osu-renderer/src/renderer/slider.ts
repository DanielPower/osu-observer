import { HitResult } from "osu-classes";
import type { HitObjectConfig, SkinImages } from "../skin";
import type { SliderData, Coordinate, HitObject } from "osu-simulation";
import { HIDDEN_FADE_IN_MULTIPLIER, HIDDEN_FADE_OUT_MULTIPLIER, partitionPoint } from "../math";
import {
  Animated,
  inQuad,
  latestShakeOffset,
  outElasticHalf,
  outQuad,
  outQuint,
  progress,
  tween,
} from "./anim";
import { drawSprite, drawTintedSprite, scaleColor, spriteSize } from "./draw";
import { circleVisible, drawApproachCircle, drawHitCircle, type CircleParams } from "./hitcircle";

/** DrawableSlider's fade_out_time: the whole slider fades out this long after it ends. */
export const SLIDER_FADE_OUT = 240;
const MISS_WINDOW = 400;
const DIM = 195 / 255;
const DIM_STEPS = 5;
/** Slider end circles and reverse arrows are capped at twice the object's size. */
const MAX_CIRCLE_SIZE = 256;
/** sliderscorepoint is capped at the object's size. */
const MAX_TICK_SIZE = 128;
/** Lazer's MAX_FOLLOW_CIRCLE_AREA_SIZE, for the ball and follow circle. */
const MAX_FOLLOW_SIZE = 384;
/** DrawableSliderTick.ANIM_DURATION. */
const TICK_ANIM = 150;

function buildSliderBody(
  path: Coordinate[],
  radius: number,
  color: number,
  renderScale: number,
  offsetX: number,
  offsetY: number,
): { canvas: OffscreenCanvas; x: number; y: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of path) {
    const px = p.x * renderScale + offsetX;
    const py = p.y * renderScale + offsetY;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  const padding = radius + 4;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const w = Math.max(1, Math.ceil(maxX - minX));
  const h = Math.max(1, Math.ceil(maxY - minY));

  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext("2d")!;

  const toLocal = (p: Coordinate) => ({
    x: p.x * renderScale + offsetX - minX,
    y: p.y * renderScale + offsetY - minY,
  });

  // Border (white outline)
  ctx.beginPath();
  const p0 = toLocal(path[0]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < path.length; i++) {
    const p = toLocal(path[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = radius * 2 + 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // Inner body (darkened combo color)
  const r = Math.floor(((color >> 16) & 0xff) * 0.3);
  const g = Math.floor(((color >> 8) & 0xff) * 0.3);
  const b = Math.floor((color & 0xff) * 0.3);

  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < path.length; i++) {
    const p = toLocal(path[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = radius * 2 - 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  return { canvas: offscreen, x: minX, y: minY };
}

export type SliderTickPos = {
  screenX: number;
  screenY: number;
  time: number;
  /** When it fades in (lazer's SliderTick.TimePreempt). */
  appearTime: number;
  resultTime?: number;
  hit?: boolean;
};

export type SliderRepeatPos = {
  screenX: number;
  screenY: number;
  time: number;
  rotation: number;
  /** When it appears (lazer's SliderEndCircle.TimePreempt). */
  appearTime: number;
  /** How long its circle fades in, and its arrow. */
  circleFadeIn: number;
  arrowFadeIn: number;
  resultTime?: number;
  hit?: boolean;
};

export type SliderState = {
  startTime: number;
  endTime: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  number: number;
  color: number;
  comboColorIndex: number;
  radius: number;
  preempt: number;
  fadeIn: number;
  /** Canvas pixels per osu! pixel. */
  osuScale: number;
  screenPath: Array<{ x: number; y: number }>;
  /** Distance along screenPath to each of its points, for moving the ball at a constant speed. */
  pathLengths: number[];
  ticks: SliderTickPos[];
  repeats: SliderRepeatPos[];
  duration: number;
  spanDuration: number;
  repeatCount: number;
  /** When the tail circle appears, and how long it fades in. */
  tailAppearTime: number;
  tailFadeIn: number;
  hitObject: HitObject;
  followScale: Animated;
  followAlpha: Animated;

  bodyCanvas: OffscreenCanvas;
  bodyX: number;
  bodyY: number;
};

/** Pre-hittable dim from DrawableOsuHitObject.applyDim, as a colour multiplier. */
function dimAt(time: number, hitTime: number): number {
  const dim = tween(time, hitTime - MISS_WINDOW, 100, DIM, 1);
  return DIM + Math.round(((dim - DIM) / (1 - DIM)) * DIM_STEPS) * ((1 - DIM) / DIM_STEPS);
}

/**
 * The follow circle's scale and alpha over the slider, as lazer's LegacyFollowCircle
 * reacts to tracking and to its ticks, repeats and tail being judged.
 */
function buildFollowCircle(
  hitObject: HitObject,
  trackingStarts: number[],
): { scale: Animated; alpha: Animated } {
  const scale = new Animated(1);
  const alpha = new Animated(0);
  const start = hitObject.time;
  const end = hitObject.endTime!;

  type Event = { time: number; order: number; apply: () => void };
  const events: Event[] = [];
  for (const time of trackingStarts) {
    const at = Math.max(time, start);
    if (at >= end) continue;
    events.push({
      time: at,
      order: 0,
      apply: () => {
        const remaining = Math.max(0, end - at);
        scale.set(at, 1).to(at, Math.min(180, remaining), 2, outQuad);
        alpha.set(at, 0).to(at, Math.min(60, remaining), 1);
      },
    });
  }
  for (const event of hitObject.sliderEvents ?? []) {
    const at = event.resultTime;
    if (!event.hit) {
      events.push({
        time: at,
        order: 1,
        apply: () => {
          scale.to(at, 100, 4);
          alpha.to(at, 100, 0);
        },
      });
    } else if (event.kind === "sliderTail") {
      const sliderEnd = Math.max(end, at);
      events.push({
        time: sliderEnd,
        order: 1,
        apply: () => {
          scale.to(sliderEnd, 200, 1.6, outQuad);
          alpha.to(sliderEnd, 200, 0, inQuad);
        },
      });
    } else {
      events.push({
        time: at,
        order: 1,
        apply: () => {
          if (scale.at(at) >= 2) scale.set(at, 2.2).to(at, 200, 2);
        },
      });
    }
  }
  events.sort((a, b) => a.time - b.time || a.order - b.order);
  for (const event of events) event.apply();
  return { scale, alpha };
}

export function createSlider({
  x,
  y,
  number,
  comboColorIndex,
  comboColors,
  radius,
  preempt,
  fadeIn,
  sliderData,
  hitObject,
  trackingStarts,
  scale,
  offsetX,
  offsetY,
}: {
  x: number;
  y: number;
  number: number;
  comboColorIndex: number;
  comboColors: number[];
  radius: number;
  preempt: number;
  fadeIn: number;
  sliderData: SliderData;
  /** The simulated slider, for its judgements and shakes. */
  hitObject: HitObject;
  /** When the player started tracking the slider, each time. */
  trackingStarts: number[];
  scale: number;
  offsetX: number;
  offsetY: number;
}): SliderState {
  const color = comboColors[comboColorIndex % comboColors.length];
  const time = hitObject.time;
  const endTime = hitObject.endTime!;
  const spanDuration = sliderData.duration / (sliderData.repeats + 1);

  const screenPath = sliderData.path.map((p) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  }));

  const pathLengths = [0];
  for (let i = 1; i < screenPath.length; i++) {
    const dx = screenPath[i].x - screenPath[i - 1].x;
    const dy = screenPath[i].y - screenPath[i - 1].y;
    pathLengths.push(pathLengths[i - 1] + Math.hypot(dx, dy));
  }

  // With an odd number of repeats the slider finishes back at its head, so its
  // end circle (and tail judgement) is there rather than at the path's tip.
  const endsAtHead = sliderData.repeats % 2 === 1;
  const endX = endsAtHead ? x : sliderData.endPosition.x * scale + offsetX;
  const endY = endsAtHead ? y : sliderData.endPosition.y * scale + offsetY;

  const tickResults = (hitObject.sliderEvents ?? []).filter((e) => e.kind === "sliderTick");
  const repeatResults = (hitObject.sliderEvents ?? []).filter((e) => e.kind === "sliderRepeat");

  const ticks: SliderTickPos[] = [...sliderData.tickPositions]
    .sort((a, b) => a.time - b.time)
    .map((t, i) => {
      // SliderTick.ApplyDefaultsToSelf: ticks after the first span get stable's 200ms.
      const spanIndex = Math.min(
        sliderData.repeats,
        Math.max(0, Math.floor((t.time - time) / spanDuration)),
      );
      const spanStart = time + spanIndex * spanDuration;
      const tickPreempt = (t.time - spanStart) / 2 + (spanIndex > 0 ? 200 : preempt * 0.66);
      return {
        screenX: t.position.x * scale + offsetX,
        screenY: t.position.y * scale + offsetY,
        time: t.time,
        appearTime: t.time - tickPreempt,
        resultTime: tickResults[i]?.resultTime,
        hit: tickResults[i]?.hit,
      };
    });

  const repeats: SliderRepeatPos[] = sliderData.repeatPositions.map((rep, i) => {
    const rx = rep.position.x * scale + offsetX;
    const ry = rep.position.y * scale + offsetY;

    let rotation = 0;
    if (sliderData.path.length >= 2) {
      const isAtEnd = i % 2 === 0;
      const target: Coordinate = isAtEnd
        ? sliderData.path[sliderData.path.length - 2]
        : sliderData.path[1];
      const dx = target.x * scale + offsetX - rx;
      const dy = target.y * scale + offsetY - ry;
      rotation = Math.atan2(dy, dx);
    }

    // SliderEndCircle.ApplyDefaultsToSelf: the first repeat fades in with the
    // slider; later ones appear, unfaded, as the previous one at their end is hit.
    const appearTime = i === 0 ? time - preempt : rep.time - spanDuration * 2;
    return {
      screenX: rx,
      screenY: ry,
      time: rep.time,
      rotation,
      appearTime,
      circleFadeIn: i === 0 ? fadeIn : 0,
      arrowFadeIn: i === 0 ? 150 : Math.min(spanDuration, 150),
      resultTime: repeatResults[i]?.resultTime,
      hit: repeatResults[i]?.hit,
    };
  });

  const {
    canvas: bodyCanvas,
    x: bodyX,
    y: bodyY,
  } = buildSliderBody(sliderData.path, radius, color, scale, offsetX, offsetY);

  const follow = buildFollowCircle(hitObject, trackingStarts);

  return {
    startTime: time,
    endTime,
    startX: x,
    startY: y,
    endX,
    endY,
    number,
    color,
    comboColorIndex,
    radius,
    preempt,
    fadeIn,
    osuScale: scale,
    screenPath,
    pathLengths,
    ticks,
    repeats,
    duration: sliderData.duration,
    spanDuration,
    repeatCount: sliderData.repeats,
    tailAppearTime: sliderData.repeats === 0 ? time - preempt : endTime - spanDuration * 2,
    tailFadeIn: sliderData.repeats === 0 ? fadeIn : 0,
    hitObject,
    followScale: follow.scale,
    followAlpha: follow.alpha,
    bodyCanvas,
    bodyX,
    bodyY,
  };
}

/**
 * Rebuilds the slider body OffscreenCanvas after a combo color change.
 * Mutates `state` in place.
 */
export function rebuildSliderBody(state: SliderState, newColor: number): void {
  state.color = newColor;
  // screenPath is already in canvas pixels, so treat it as game coords
  // with scale=1 and no offset — buildSliderBody will leave values unchanged.
  const { canvas, x, y } = buildSliderBody(
    state.screenPath as Coordinate[],
    state.radius,
    newColor,
    1,
    0,
    0,
  );
  state.bodyCanvas = canvas;
  state.bodyX = x;
  state.bodyY = y;
}

/** Where the ball is at `time`, and the direction (radians) the path runs there. */
function ballAt(state: SliderState, time: number): { x: number; y: number; angle: number } {
  const { startTime, duration, repeatCount, screenPath, pathLengths } = state;
  const progressAll = Math.min(1, Math.max(0, (time - startTime) / duration));
  const totalSpans = repeatCount + 1;
  const currentSpan = Math.min(totalSpans - 1, Math.floor(progressAll * totalSpans));
  const spanProgress = progressAll * totalSpans - currentSpan;
  const pathProgress = currentSpan % 2 === 1 ? 1 - spanProgress : spanProgress;

  // The ball moves at a constant speed along the path, as the simulator's
  // path.positionAt does, so find the segment by distance rather than by point index.
  const distance = pathProgress * pathLengths[pathLengths.length - 1];
  const pathIndex = Math.max(
    0,
    Math.min(
      partitionPoint(pathLengths, 0, pathLengths.length, (length) => length <= distance) - 1,
      screenPath.length - 2,
    ),
  );
  const segmentLength = pathLengths[pathIndex + 1] - pathLengths[pathIndex];
  const localProgress =
    segmentLength > 0 ? Math.min(1, (distance - pathLengths[pathIndex]) / segmentLength) : 0;
  const p1 = screenPath[pathIndex];
  const p2 = screenPath[Math.min(pathIndex + 1, screenPath.length - 1)];
  return {
    x: p1.x + (p2.x - p1.x) * localProgress,
    y: p1.y + (p2.y - p1.y) * localProgress,
    // DrawableSliderBall faces the path's direction (not the ball's, so it
    // doesn't flip on repeats).
    angle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
  };
}

/** Whether the slider still draws anything at `time`. */
export function sliderVisible(state: SliderState, time: number): boolean {
  return time < state.endTime + SLIDER_FADE_OUT;
}

/** The head's circle params, shared by the head and its approach circle. */
function headParams(
  state: SliderState,
  time: number,
  alpha: number,
  hidden: boolean,
  unit: number,
  config: HitObjectConfig,
): CircleParams {
  const { hitObject } = state;
  return {
    x: state.startX,
    y: state.startY,
    hitTime: state.startTime,
    resultTime: hitObject.resultTime,
    result: hitObject.result,
    shakes: hitObject.shakes,
    currentTime: time,
    preempt: state.preempt,
    alpha,
    number: state.number,
    color: state.color,
    hidden,
    unit,
    config,
    sliderHead: true,
  };
}

/** The end-circle sprites: sliderendcircle, or the hit circle's when the skin has none. */
function endCircleImages(images: SkinImages) {
  return images.sliderendcircle
    ? { circle: images.sliderendcircle, overlay: images.sliderendcircleoverlay }
    : { circle: images.hitcircle, overlay: images.hitcircleoverlay };
}

function drawEndCircle(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  x: number,
  y: number,
  unit: number,
  color: number,
  dim: number,
  alpha: number,
): void {
  if (alpha <= 0) return;
  const { circle, overlay } = endCircleImages(images);
  if (circle) {
    const size = spriteSize(circle, unit, MAX_CIRCLE_SIZE);
    drawTintedSprite(ctx, circle, x, y, size.width, size.height, scaleColor(color, dim), alpha);
  }
  if (overlay) {
    const size = spriteSize(overlay, unit, MAX_CIRCLE_SIZE);
    if (dim < 1) {
      drawTintedSprite(
        ctx,
        overlay,
        x,
        y,
        size.width,
        size.height,
        scaleColor(0xffffff, dim),
        alpha,
      );
    } else {
      drawSprite(ctx, overlay, x, y, size.width, size.height, alpha);
    }
  }
}

export function drawSlider(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  state: SliderState,
  time: number,
  alpha: number,
  hidden: boolean,
  config: HitObjectConfig,
): void {
  const { startTime, endTime, preempt, radius, hitObject } = state;
  // Canvas pixels per skin pixel at this slider's scale.
  const unit = radius / 64;

  let bodyAlpha = 0.8;
  let endCircleAlpha = 1;
  let headAlpha = 1;

  if (hidden) {
    const fadeOutStart = startTime - preempt + preempt * HIDDEN_FADE_IN_MULTIPLIER;
    if (time >= fadeOutStart) {
      const fadeOutDuration = preempt * HIDDEN_FADE_OUT_MULTIPLIER;
      const longFadeDuration = Math.max(1, endTime - fadeOutStart);

      const linearProgress = Math.min(1, (time - fadeOutStart) / fadeOutDuration);
      const linearAlpha = 1 - linearProgress;

      const bodyProgress = Math.min(1, (time - fadeOutStart) / longFadeDuration);
      bodyAlpha = 0.8 * (1 - bodyProgress) ** 2;
      endCircleAlpha = linearAlpha;
      headAlpha = linearAlpha;
    }
  }

  // The whole slider fades out after it ends.
  const sliderAlpha = 1 - progress(time, endTime, SLIDER_FADE_OUT);
  const dim = dimAt(time, startTime);
  // The body, tail, ticks and repeats shake with the head (in osu! pixels, unscaled).
  const shake = latestShakeOffset(hitObject.shakes, time) * state.osuScale;
  const prev = ctx.globalAlpha;

  // Slider body
  ctx.globalAlpha = alpha * bodyAlpha * sliderAlpha;
  ctx.drawImage(state.bodyCanvas, state.bodyX + shake, state.bodyY);
  ctx.globalAlpha = prev;

  // Tail circle: drawn under the ticks and repeats, as lazer proxies it.
  {
    let tailAlpha = tween(time, state.tailAppearTime, state.tailFadeIn, 0, 1);
    if (time < state.tailAppearTime) tailAlpha = 0;
    const tailResultTime = hitObject.endResultTime ?? endTime;
    if (hitObject.endResult === HitResult.Miss && time >= tailResultTime) {
      tailAlpha *= 1 - progress(time, tailResultTime, 100);
    }
    drawEndCircle(
      ctx,
      images,
      state.endX + shake,
      state.endY,
      unit,
      state.color,
      dim,
      tailAlpha * endCircleAlpha * sliderAlpha,
    );
  }

  // Ticks
  if (images.sliderscorepoint) {
    for (const tick of state.ticks) {
      if (time < tick.appearTime) continue;
      let tickAlpha = tween(time, tick.appearTime, TICK_ANIM, 0, 1);
      let tickScale = tween(time, tick.appearTime, TICK_ANIM * 4, 0.5, 1, outElasticHalf);
      if (tick.resultTime !== undefined && time >= tick.resultTime) {
        tickAlpha *= 1 - progress(time, tick.resultTime, TICK_ANIM, outQuint);
        if (tick.hit) tickScale *= tween(time, tick.resultTime, TICK_ANIM, 1, 1.5, outQuad);
      }
      tickAlpha *= sliderAlpha * endCircleAlpha;
      if (tickAlpha <= 0) continue;
      const size = spriteSize(images.sliderscorepoint, unit * tickScale, MAX_TICK_SIZE);
      drawSprite(
        ctx,
        images.sliderscorepoint,
        tick.screenX + shake,
        tick.screenY,
        size.width,
        size.height,
        tickAlpha,
      );
    }
  }

  // Repeats: each has its own end circle, with its arrow drawn above the head.
  const arrows: { rep: SliderRepeatPos; alpha: number; scale: number; rotation: number }[] = [];
  for (const rep of state.repeats) {
    if (time < rep.appearTime) continue;
    let circleAlpha = tween(time, rep.appearTime, rep.circleFadeIn, 0, 1);
    let arrowAlpha = tween(time, rep.appearTime, rep.arrowFadeIn, 0, 1);
    let arrowScale: number;
    let arrowRotation = 0;
    const animDuration = Math.min(300, state.spanDuration);
    if (rep.resultTime !== undefined && time >= rep.resultTime) {
      const fade = 1 - progress(time, rep.resultTime, animDuration, rep.hit ? outQuad : undefined);
      circleAlpha *= fade;
      arrowAlpha *= fade;
      arrowScale = rep.hit ? tween(time, rep.resultTime, animDuration, 1, 1.4, outQuad) : 1;
    } else {
      // LegacyReverseArrow's pulse: 1.3x to 1x every 300ms (and a rock on v1 skins).
      const loop = (time - rep.appearTime) % 300;
      if (config.version <= 1) {
        arrowScale = tween(loop, 0, 300, 1.3, 1);
        arrowRotation = (tween(loop, 0, 300, 5.625, -5.625) * Math.PI) / 180;
      } else {
        arrowScale = tween(loop, 0, 300, 1.3, 1, outQuad);
      }
    }
    const pieceAlpha = sliderAlpha * endCircleAlpha;
    drawEndCircle(
      ctx,
      images,
      rep.screenX + shake,
      rep.screenY,
      unit,
      state.color,
      dim,
      circleAlpha * pieceAlpha,
    );
    arrows.push({
      rep,
      alpha: arrowAlpha * pieceAlpha,
      scale: arrowScale,
      rotation: arrowRotation,
    });
  }

  // Head
  const head = headParams(state, time, alpha * headAlpha * sliderAlpha, hidden, unit, config);
  if (circleVisible(time, head.resultTime, head.result)) drawHitCircle(ctx, images, head);

  if (images.reversearrow) {
    for (const { rep, alpha: arrowAlpha, scale, rotation } of arrows) {
      if (arrowAlpha <= 0) continue;
      const size = spriteSize(images.reversearrow, unit * scale, MAX_CIRCLE_SIZE);
      ctx.save();
      ctx.translate(rep.screenX + shake, rep.screenY);
      ctx.rotate(rep.rotation + rotation);
      ctx.globalAlpha = arrowAlpha;
      ctx.drawImage(
        images.reversearrow,
        -size.width / 2,
        -size.height / 2,
        size.width,
        size.height,
      );
      ctx.restore();
    }
  }

  // Follow circle, then the ball over it.
  const ball = ballAt(state, time);
  const followAlpha = state.followAlpha.at(time) * sliderAlpha;
  if (images.sliderfollowcircle && followAlpha > 0) {
    // LegacyFollowCircle halves the sprite, as follow circles are drawn at 2x.
    const size = spriteSize(
      images.sliderfollowcircle,
      unit * 0.5 * state.followScale.at(time),
      MAX_FOLLOW_SIZE,
    );
    drawSprite(
      ctx,
      images.sliderfollowcircle,
      ball.x,
      ball.y,
      size.width,
      size.height,
      followAlpha,
    );
  }

  if (time >= startTime && time < endTime) {
    drawSliderBall(ctx, images, state, ball, unit, alpha, config);
  }
}

/** LegacySliderBall: sliderb-nd under (near black), sliderb, sliderb-spec over (additive). */
function drawSliderBall(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  state: SliderState,
  ball: { x: number; y: number; angle: number },
  unit: number,
  alpha: number,
  config: HitObjectConfig,
): void {
  const nd = images["sliderb-nd"];
  if (nd) {
    const size = spriteSize(nd, unit, MAX_FOLLOW_SIZE);
    drawTintedSprite(ctx, nd, ball.x, ball.y, size.width, size.height, 0x050505, alpha);
  }
  if (images.sliderb) {
    const size = spriteSize(images.sliderb, unit, MAX_FOLLOW_SIZE);
    const tint = config.allowSliderBallTint ? state.color : config.sliderBallColour;
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.angle);
    drawTintedSprite(ctx, images.sliderb, 0, 0, size.width, size.height, tint, alpha);
    ctx.restore();
  }
  const spec = images["sliderb-spec"];
  if (spec) {
    const size = spriteSize(spec, unit, MAX_FOLLOW_SIZE);
    const previous = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    drawSprite(ctx, spec, ball.x, ball.y, size.width, size.height, alpha);
    ctx.globalCompositeOperation = previous;
  }
}

/** The head's approach circle, drawn above every hit object. */
export function drawSliderApproachCircle(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  state: SliderState,
  time: number,
  hidden: boolean,
  config: HitObjectConfig,
): void {
  const head = headParams(state, time, 1, hidden, state.radius / 64, config);
  drawApproachCircle(ctx, images, { ...head, fadeIn: state.fadeIn });
}
