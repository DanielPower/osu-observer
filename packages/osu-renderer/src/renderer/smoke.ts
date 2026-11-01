import type { SimulatedFrames } from "osu-simulation";
import { StandardAction } from "osu-standard-stable";
import { partitionPoint } from "../math";
import { skinImageSize, type SkinImages } from "../skin";

// Follows lazer's SmokeContainer and SmokeSegment: each press of the smoke key lays a
// segment of points along the cursor's path, which fade, grow and turn over time.

const INITIAL_FADE_OUT_DURATION = 4000;
const RE_FADE_IN_SPEED = 3;
const RE_FADE_IN_DURATION = 50;
const FINAL_FADE_OUT_SPEED = 2;
const FINAL_FADE_OUT_DURATION = 8000;
const INITIAL_ALPHA = 0.6;
const RE_FADE_IN_ALPHA = 1;
const SCALE_DURATION = 1200;
const INITIAL_SCALE = 0.65;
const FINAL_SCALE = 1;
const ROTATION_DURATION = 500;
const MAX_ROTATION = 0.25;
// Lazer's stand-in for a segment still being drawn.
const NOT_ENDED = Number.MAX_VALUE;

const SMOKE_BIT = 1 << StandardAction.Smoke;

const easeOut5 = (t: number) => 1 - (1 - t) ** 5;

// A stable pseudo-random number in [0, 1) for a seed and index, in place of lazer's RNG.
function random(seed: number, index: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

type Segment = {
  startTime: number;
  endTime: number;
  lifetimeEnd: number;
  x: number[];
  y: number[];
  time: number[];
  angle: number[];
  seed: number;
};

function buildSegments(frames: SimulatedFrames, pointInterval: number): Segment[] {
  const segments: Segment[] = [];
  if (!(pointInterval > 0)) return segments;
  let segment: Segment | undefined;
  let lastX = 0;
  let lastY = 0;
  let totalDistance = 0;

  const addPosition = (x: number, y: number, time: number) => {
    const s = segment!;
    const dx = x - lastX;
    const dy = y - lastY;
    const delta = Math.hypot(dx, dy);
    totalDistance += delta;
    const count = Math.floor(totalDistance / pointInterval);
    if (count > 0) {
      const ux = delta > 0 ? dx / delta : 0;
      const uy = delta > 0 ? dy / delta : 0;
      const first = pointInterval - (totalDistance - delta);
      totalDistance %= pointInterval;
      for (let i = 0; i < count; i++) {
        s.x.push(lastX + ux * (first + i * pointInterval));
        s.y.push(lastY + uy * (first + i * pointInterval));
        s.time.push(time);
        s.angle.push(random(s.seed, -1 - s.angle.length) * 2 * Math.PI);
      }
    }
    lastX = x;
    lastY = y;
  };

  for (let i = 0; i < frames.length; i++) {
    const time = frames.time[i];
    const smoking = (frames.actions[i] & SMOKE_BIT) !== 0;
    if (segment) {
      // Between frames the cursor moves in a straight line, so a point is placed when
      // the cursor reaches it rather than at the next frame.
      const t0 = frames.time[i - 1];
      const fromX = lastX;
      const fromY = lastY;
      const length = Math.hypot(frames.x[i] - fromX, frames.y[i] - fromY);
      const before = segment.time.length;
      addPosition(frames.x[i], frames.y[i], time);
      const added = length > 0 ? segment.time.length : before;
      for (let p = before; p < added; p++) {
        const along = Math.hypot(segment.x[p] - fromX, segment.y[p] - fromY) / length;
        segment.time[p] = t0 + (time - t0) * along;
      }
      if (!smoking) {
        const truncated = Math.min(INITIAL_FADE_OUT_DURATION, time - segment.startTime);
        segment.endTime = time;
        segment.lifetimeEnd =
          time +
          FINAL_FADE_OUT_DURATION +
          truncated / RE_FADE_IN_SPEED +
          truncated / FINAL_FADE_OUT_SPEED;
        segment = undefined;
      }
    } else if (smoking) {
      segment = {
        startTime: time,
        endTime: NOT_ENDED,
        lifetimeEnd: NOT_ENDED,
        x: [],
        y: [],
        time: [],
        angle: [],
        seed: segments.length + 1,
      };
      segments.push(segment);
      lastX = frames.x[i];
      lastY = frames.y[i];
      totalDistance = pointInterval;
      addPosition(lastX, lastY, time);
    }
  }
  return segments;
}

export type Smoke = {
  draw: (ctx: CanvasRenderingContext2D, time: number) => void;
  /** Lays out the smoke for the current skin now, rather than on the next draw. */
  prepare: () => void;
};

export function createSmoke({
  frames,
  images,
  scale,
  offsetX,
  offsetY,
}: {
  frames: SimulatedFrames;
  images: SkinImages;
  scale: number;
  offsetX: number;
  offsetY: number;
}): Smoke {
  let segments: Segment[] = [];
  let segmentsInterval = -1;

  const layout = (texture: ImageBitmap) => {
    // Smoke sits in the playfield, so a skin pixel is an osu! pixel here.
    const size = skinImageSize(texture);
    const width = size.width * 0.165;
    const height = size.height * 0.165;
    const pointInterval = (width * 7) / 8;
    if (segmentsInterval !== pointInterval) {
      segments = buildSegments(frames, pointInterval);
      segmentsInterval = pointInterval;
    }
    return { width, height };
  };

  const draw = (ctx: CanvasRenderingContext2D, time: number) => {
    const texture = images["cursor-smoke"];
    if (!texture) return;
    const { width, height } = layout(texture);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const segment of segments) {
      if (time < segment.startTime) break;
      if (time >= segment.lifetimeEnd) continue;

      const smokeEndTime = time < segment.endTime ? NOT_ENDED : segment.endTime;
      const truncated = Math.min(INITIAL_FADE_OUT_DURATION, smokeEndTime - segment.startTime);
      const firstVisibleAfterEnd = smokeEndTime - truncated;
      const initialFadeOutTime = Math.min(time, smokeEndTime);
      const reFadeInTime = time - truncated - firstVisibleAfterEnd * (1 - 1 / RE_FADE_IN_SPEED);
      const finalFadeOutTime =
        time - truncated - firstVisibleAfterEnd * (1 - 1 / FINAL_FADE_OUT_SPEED);

      const firstVisible = Math.min(smokeEndTime, time) - truncated;
      const start = partitionPoint(segment.time, 0, segment.time.length, (t) => t < firstVisible);
      const end = partitionPoint(segment.time, start, segment.time.length, (t) => t <= time);

      for (let i = start; i < end; i++) {
        const pointTime = segment.time[i];

        let alpha = 1;
        const finalFadeOut = finalFadeOutTime - pointTime / FINAL_FADE_OUT_SPEED;
        if (finalFadeOut > 0 && pointTime >= firstVisibleAfterEnd) {
          const fraction = Math.min(1, Math.max(0, finalFadeOut / FINAL_FADE_OUT_DURATION)) ** 5;
          alpha = (1 - fraction) * RE_FADE_IN_ALPHA;
        } else {
          const initialFadeOut = initialFadeOutTime - pointTime;
          if (initialFadeOut > 0) {
            const fraction = Math.min(1, Math.max(0, initialFadeOut / INITIAL_FADE_OUT_DURATION));
            alpha = (1 - fraction) * INITIAL_ALPHA;
          }
          if (pointTime > firstVisibleAfterEnd) {
            const reFadeIn = reFadeInTime - pointTime / RE_FADE_IN_SPEED;
            if (reFadeIn > 0) {
              const fraction = easeOut5(Math.min(1, Math.max(0, reFadeIn / RE_FADE_IN_DURATION)));
              alpha = fraction * (RE_FADE_IN_ALPHA - alpha) + alpha;
            }
          }
        }
        if (alpha <= 0) continue;

        const age = time - pointTime;
        const pointScale =
          easeOut5(Math.min(1, Math.max(0, age / SCALE_DURATION))) * (FINAL_SCALE - INITIAL_SCALE) +
          INITIAL_SCALE;
        const turn = easeOut5(Math.min(1, Math.max(0, age / ROTATION_DURATION)));
        const angle = turn * MAX_ROTATION * (random(segment.seed, i) * 2 - 1) + segment.angle[i];

        // The texture's x axis runs along (sin, -cos) of the angle and its y axis
        // perpendicular to it, each half-extent `width`/`height` scaled.
        const dirX = Math.sin(angle);
        const dirY = -Math.cos(angle);
        const sw = pointScale * width * scale;
        const sh = pointScale * height * scale;
        ctx.globalAlpha = alpha;
        ctx.setTransform(
          dirX * sw,
          dirY * sw,
          -dirY * sh,
          dirX * sh,
          segment.x[i] * scale + offsetX,
          segment.y[i] * scale + offsetY,
        );
        ctx.drawImage(texture, -1, -1, 2, 2);
      }
    }
    ctx.restore();
  };

  return {
    draw,
    prepare: () => {
      if (images["cursor-smoke"]) layout(images["cursor-smoke"]);
    },
  };
}
