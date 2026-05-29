import type { SkinImages } from "../skin";
import type { SliderData, Coordinate } from "osu-simulation";
import { HIDDEN_FADE_IN_MULTIPLIER, HIDDEN_FADE_OUT_MULTIPLIER } from "../math";
import { drawSprite, drawTintedSprite } from "./draw";

function approachCircleRadius(timeRemaining: number, preempt: number, radius: number): number {
  const progress = Math.min(Math.max(1 - timeRemaining / preempt, 0), 1);
  return (3 - 2 * progress) * radius;
}

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

export type SliderTickPos = { screenX: number; screenY: number; time: number };

export type SliderRepeatPos = {
  screenX: number;
  screenY: number;
  time: number;
  rotation: number;
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
  screenPath: Array<{ x: number; y: number }>;
  ticks: SliderTickPos[];
  repeats: SliderRepeatPos[];
  duration: number;
  repeatCount: number;

  bodyCanvas: OffscreenCanvas;
  bodyX: number;
  bodyY: number;
};

export function createSlider({
  x,
  y,
  time,
  endTime,
  number,
  comboColorIndex,
  comboColors,
  radius,
  preempt,
  sliderData,
  scale,
  offsetX,
  offsetY,
}: {
  x: number;
  y: number;
  time: number;
  endTime: number;
  number: number;
  comboColorIndex: number;
  comboColors: number[];
  radius: number;
  preempt: number;
  sliderData: SliderData;
  scale: number;
  offsetX: number;
  offsetY: number;
}): SliderState {
  const color = comboColors[comboColorIndex % comboColors.length];

  const screenPath = sliderData.path.map((p) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  }));

  const endX = sliderData.endPosition.x * scale + offsetX;
  const endY = sliderData.endPosition.y * scale + offsetY;

  const ticks: SliderTickPos[] = sliderData.tickPositions.map((t) => ({
    screenX: t.position.x * scale + offsetX,
    screenY: t.position.y * scale + offsetY,
    time: t.time,
  }));

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

    return { screenX: rx, screenY: ry, time: rep.time, rotation };
  });

  const {
    canvas: bodyCanvas,
    x: bodyX,
    y: bodyY,
  } = buildSliderBody(sliderData.path, radius, color, scale, offsetX, offsetY);

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
    screenPath,
    ticks,
    repeats,
    duration: sliderData.duration,
    repeatCount: sliderData.repeats,
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

export function drawSlider(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  state: SliderState,
  time: number,
  alpha: number,
  hidden: boolean,
  isTracking: boolean,
): void {
  const {
    startTime,
    endTime,
    startX,
    startY,
    endX,
    endY,
    number,
    color,
    radius,
    preempt,
    screenPath,
    ticks,
    repeats,
    duration,
    repeatCount,
    bodyCanvas,
    bodyX,
    bodyY,
  } = state;

  const isActive = time >= startTime && time <= endTime;

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

      if (time < startTime) {
        headAlpha = linearAlpha;
      }
    }
  }

  // Slider body
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = alpha * bodyAlpha;
  ctx.drawImage(bodyCanvas, bodyX, bodyY);
  ctx.globalAlpha = prev;

  // Tick marks (hidden after being passed)
  for (const tick of ticks) {
    if (time >= tick.time) continue;
    if (images.sliderscorepoint) {
      drawSprite(
        ctx,
        images.sliderscorepoint,
        tick.screenX,
        tick.screenY,
        radius * 0.8,
        radius * 0.8,
        alpha,
      );
    }
  }

  // Reverse arrows
  for (const rep of repeats) {
    if (time >= rep.time) continue;
    if (images.reversearrow) {
      const pulse = 1 + 0.1 * Math.sin(((rep.time - time) / 200) * Math.PI * 2);
      const aw = radius * 1.8 * pulse;
      ctx.save();
      ctx.translate(rep.screenX, rep.screenY);
      ctx.rotate(rep.rotation);
      ctx.globalAlpha = alpha;
      ctx.drawImage(images.reversearrow, -aw / 2, -aw / 2, aw, aw);
      ctx.restore();
    }
  }

  // End circle
  if (images.sliderendcircle) {
    drawTintedSprite(
      ctx,
      images.sliderendcircle,
      endX,
      endY,
      radius * 2,
      radius * 2,
      color,
      alpha * endCircleAlpha,
    );
  }
  if (images.sliderendcircleoverlay) {
    drawSprite(
      ctx,
      images.sliderendcircleoverlay,
      endX,
      endY,
      radius * 2,
      radius * 2,
      alpha * endCircleAlpha,
    );
  }

  // Start circle
  if (!isActive) {
    const effectiveHeadAlpha = alpha * headAlpha;

    const startCircleImg = images.sliderstartcircle ?? images.hitcircle;
    if (startCircleImg) {
      drawTintedSprite(
        ctx,
        startCircleImg,
        startX,
        startY,
        radius * 2,
        radius * 2,
        color,
        effectiveHeadAlpha,
      );
    }

    if (images.sliderstartcircleoverlay ?? images.hitcircleoverlay) {
      const overlayImg = (images.sliderstartcircleoverlay ?? images.hitcircleoverlay)!;
      drawSprite(ctx, overlayImg, startX, startY, radius * 2, radius * 2, effectiveHeadAlpha);
    }

    // Number
    ctx.save();
    ctx.globalAlpha = effectiveHeadAlpha;
    ctx.font = `bold ${radius * 0.7}px Arial`;
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), startX, startY);
    ctx.restore();

    // Approach circle
    if (!hidden && images.approachcircle) {
      const approachR = approachCircleRadius(startTime - time, preempt, radius);
      drawTintedSprite(
        ctx,
        images.approachcircle,
        startX,
        startY,
        approachR * 2,
        approachR * 2,
        color,
        alpha,
      );
    }
  }

  if (isActive) {
    const progress = (time - startTime) / duration;
    const totalSpans = repeatCount + 1;
    const currentSpan = Math.floor(progress * totalSpans);
    const spanProgress = (progress * totalSpans) % 1;
    const isReverse = currentSpan % 2 === 1;
    const pathProgress = isReverse ? 1 - spanProgress : spanProgress;

    const pathIndex = Math.min(
      Math.floor(pathProgress * (screenPath.length - 1)),
      screenPath.length - 2,
    );
    const localProgress = pathProgress * (screenPath.length - 1) - pathIndex;
    const p1 = screenPath[pathIndex];
    const p2 = screenPath[Math.min(pathIndex + 1, screenPath.length - 1)];
    const ballX = p1.x + (p2.x - p1.x) * localProgress;
    const ballY = p1.y + (p2.y - p1.y) * localProgress;

    if (images.sliderb) {
      drawTintedSprite(ctx, images.sliderb, ballX, ballY, radius * 2, radius * 2, color, alpha);
    } else if (images["sliderb-nd"]) {
      drawTintedSprite(
        ctx,
        images["sliderb-nd"],
        ballX,
        ballY,
        radius * 2,
        radius * 2,
        color,
        alpha,
      );
    }

    if (isTracking && images.sliderfollowcircle) {
      const followR = radius * 2.4;
      drawSprite(ctx, images.sliderfollowcircle, ballX, ballY, followR * 2, followR * 2, alpha);
    }
  }
}
