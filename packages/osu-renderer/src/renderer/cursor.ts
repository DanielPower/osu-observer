import type { SimulatedFrames } from "osu-simulation";
import { StandardAction } from "osu-standard-stable";
import { partitionPoint } from "../math";
import { DEFAULT_CURSOR_CONFIG, skinImageSize, type CursorConfig, type SkinImages } from "../skin";

// Follows lazer's LegacyCursor, OsuCursorContainer, CursorTrail and LegacyCursorTrail.

// Legacy skin pixels are drawn at 1x on a 768px tall screen, where an osu! pixel is 1.6 screen pixels.
const STABLE_MAGIC_SCALE_FACTOR = 1.6;
const REVOLUTION_DURATION = 10000;
const PRESSED_SCALE = 1.3;
const EXPAND_DURATION = 100;
const MAX_TRAIL_PARTS = 2048;
const TRAIL_FADE_DURATION = 500;
const DISJOINT_TRAIL_FADE_DURATION = 150;
const DISJOINT_TRAIL_SEPARATION = 1000 / 60;

const BUTTON_BITS = (1 << StandardAction.LeftButton) | (1 << StandardAction.RightButton);

const easeOutQuad = (t: number) => t * (2 - t);

type ExpandEvents = { time: Float64Array; pressed: Uint8Array; length: number };

// Each press of either button restarts the cursor's expansion from 1x; it contracts
// once both are up.
function findExpandEvents(frames: SimulatedFrames): ExpandEvents {
  const time = new Float64Array(frames.length);
  const pressed = new Uint8Array(frames.length);
  let length = 0;
  let previous = 0;
  for (let i = 0; i < frames.length; i++) {
    const buttons = frames.actions[i] & BUTTON_BITS;
    if (buttons & ~previous) {
      time[length] = frames.time[i];
      pressed[length++] = 1;
    } else if (previous && !buttons) {
      time[length] = frames.time[i];
      pressed[length++] = 0;
    }
    previous = buttons;
  }
  return { time, pressed, length };
}

function expandScaleAt(events: ExpandEvents, time: number): number {
  const index = partitionPoint(events.time, 0, events.length, (t) => t <= time) - 1;
  if (index < 0) return 1;
  const pressedScale = (pressTime: number, at: number) =>
    1 + (PRESSED_SCALE - 1) * easeOutQuad(Math.min(1, (at - pressTime) / EXPAND_DURATION));
  if (events.pressed[index]) return pressedScale(events.time[index], time);
  const from = index > 0 ? pressedScale(events.time[index - 1], events.time[index]) : 1;
  return (
    from + (1 - from) * easeOutQuad(Math.min(1, (time - events.time[index]) / EXPAND_DURATION))
  );
}

type TrailParts = {
  x: Float32Array;
  y: Float32Array;
  time: Float64Array;
  scale: Float32Array;
  length: number;
};

// A continuous trail (the skin has cursormiddle) lays parts `interval` apart along the
// cursor's path, keeping two intervals behind the cursor. Replay input moves the cursor in
// straight lines between frames, so each part's time is solved for exactly.
function buildTrail(frames: SimulatedFrames, interval: number, events: ExpandEvents): TrailParts {
  let capacity = 1024;
  let parts: TrailParts = {
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    time: new Float64Array(capacity),
    scale: new Float32Array(capacity),
    length: 0,
  };
  if (frames.length === 0 || !(interval > 0)) return parts;

  const add = (x: number, y: number, time: number) => {
    if (parts.length === capacity) {
      capacity *= 2;
      const grow = <T extends Float32Array | Float64Array>(a: T, make: new (n: number) => T) => {
        const grown = new make(capacity);
        grown.set(a);
        return grown;
      };
      parts = {
        x: grow(parts.x, Float32Array),
        y: grow(parts.y, Float32Array),
        time: grow(parts.time, Float64Array),
        scale: grow(parts.scale, Float32Array),
        length: parts.length,
      };
    }
    parts.x[parts.length] = x;
    parts.y[parts.length] = y;
    parts.time[parts.length] = time;
    parts.scale[parts.length] = expandScaleAt(events, time);
    parts.length++;
  };

  const threshold = 4 * interval * interval;
  let lastX = frames.x[0];
  let lastY = frames.y[0];
  for (let i = 0; i + 1 < frames.length; i++) {
    const ax = frames.x[i];
    const ay = frames.y[i];
    const dx = frames.x[i + 1] - ax;
    const dy = frames.y[i + 1] - ay;
    const t0 = frames.time[i];
    const dt = frames.time[i + 1] - t0;
    const a = dx * dx + dy * dy;
    if (a === 0) continue;
    let u = 0;
    for (;;) {
      // When along this segment the cursor gets two intervals from the last part.
      const px = ax - lastX;
      const py = ay - lastY;
      const b = 2 * (px * dx + py * dy);
      const c = px * px + py * py - threshold;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) break;
      const reach = Math.max(u, (-b + Math.sqrt(discriminant)) / (2 * a));
      if (reach > 1) break;
      u = reach;
      const cx = ax + dx * u - lastX;
      const cy = ay + dy * u - lastY;
      const distance = Math.hypot(cx, cy);
      if (distance < 2 * interval - 1e-9) {
        // The cursor is already past the crossing; move on along the segment.
        u = Math.min(1, u + 1e-6);
        if (u >= 1) break;
        continue;
      }
      lastX += (cx / distance) * interval;
      lastY += (cy / distance) * interval;
      add(lastX, lastY, t0 + dt * u);
    }
  }
  return parts;
}

export type Cursor = {
  draw: (ctx: CanvasRenderingContext2D, time: number, x: number, y: number) => void;
  setConfig: (config: CursorConfig) => void;
  /** Lays out a continuous trail for the current skin now, rather than on the next draw. */
  prepare: () => void;
};

export function createCursor({
  frames,
  images,
  scale,
  offsetX,
  offsetY,
  cursorScale,
}: {
  frames: SimulatedFrames;
  images: SkinImages;
  scale: number;
  offsetX: number;
  offsetY: number;
  cursorScale: number;
}): Cursor {
  let config = DEFAULT_CURSOR_CONFIG;
  const events = findExpandEvents(frames);
  // Skin pixels to canvas pixels, at the cursor's size.
  const spriteScale = (scale / STABLE_MAGIC_SCALE_FACTOR) * cursorScale;

  let trail: TrailParts | undefined;
  let trailInterval = 0;
  const trailFor = (texture: ImageBitmap): TrailParts => {
    // Parts are laid `width / 2.5` apart, in osu! pixels at the cursor's size.
    const interval =
      ((skinImageSize(texture).width / STABLE_MAGIC_SCALE_FACTOR) * cursorScale) / 2.5;
    if (!trail || trailInterval !== interval) {
      trail = buildTrail(frames, interval, events);
      trailInterval = interval;
    }
    return trail;
  };

  const expandScale = (time: number) => (config.expand ? expandScaleAt(events, time) : 1);
  const rotation = (time: number) =>
    config.rotate
      ? ((((time % REVOLUTION_DURATION) + REVOLUTION_DURATION) % REVOLUTION_DURATION) /
          REVOLUTION_DURATION) *
        2 *
        Math.PI
      : 0;

  const positionAt = (time: number): { x: number; y: number } => {
    const next = partitionPoint(frames.time, 0, frames.length, (t) => t <= time);
    if (next === 0) return { x: frames.x[0], y: frames.y[0] };
    if (next === frames.length) return { x: frames.x[next - 1], y: frames.y[next - 1] };
    const t0 = frames.time[next - 1];
    const t1 = frames.time[next];
    const alpha = t1 === t0 ? 0 : (time - t0) / (t1 - t0);
    return {
      x: frames.x[next - 1] + (frames.x[next] - frames.x[next - 1]) * alpha,
      y: frames.y[next - 1] + (frames.y[next] - frames.y[next - 1]) * alpha,
    };
  };

  const drawTrail = (ctx: CanvasRenderingContext2D, time: number, angle: number) => {
    const texture = images.cursortrail;
    if (!texture || frames.length === 0) return;
    const { width, height } = skinImageSize(texture);
    // The trail is disjoint (stamped at the cursor every 1/60s, not laid along its path)
    // unless the skin has cursormiddle. The ingest keeps cursormiddle only with its cursor.
    const disjoint = !images.cursormiddle;
    const originX = disjoint && !config.centre ? 0 : 0.5;
    const originY = originX;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const drawPart = (x: number, y: number, partScale: number, alpha: number) => {
      if (alpha <= 0) return;
      const w = width * spriteScale * partScale;
      const h = height * spriteScale * partScale;
      const cx = x * scale + offsetX;
      const cy = y * scale + offsetY;
      ctx.globalAlpha = alpha;
      ctx.setTransform(cos, sin, -sin, cos, cx, cy);
      ctx.drawImage(texture, -w * originX, -h * originY, w, h);
    };

    ctx.save();
    if (disjoint) {
      const first = Math.max(
        Math.ceil((time - DISJOINT_TRAIL_FADE_DURATION) / DISJOINT_TRAIL_SEPARATION),
        Math.ceil(frames.time[0] / DISJOINT_TRAIL_SEPARATION),
      );
      const last = Math.floor(time / DISJOINT_TRAIL_SEPARATION);
      for (let k = first; k <= last; k++) {
        const partTime = k * DISJOINT_TRAIL_SEPARATION;
        const { x, y } = positionAt(partTime);
        const alpha = 1 - (time - partTime) / DISJOINT_TRAIL_FADE_DURATION;
        drawPart(x, y, expandScale(partTime), alpha);
      }
    } else {
      const parts = trailFor(texture);
      const end = partitionPoint(parts.time, 0, parts.length, (t) => t <= time);
      const start = Math.max(
        end - MAX_TRAIL_PARTS,
        partitionPoint(parts.time, 0, end, (t) => t <= time - TRAIL_FADE_DURATION),
      );
      ctx.globalCompositeOperation = "lighter";
      for (let i = start; i < end; i++) {
        const alpha = 1 - (time - parts.time[i]) / TRAIL_FADE_DURATION;
        drawPart(parts.x[i], parts.y[i], config.expand ? parts.scale[i] : 1, alpha);
      }
    }
    ctx.restore();
  };

  const draw = (ctx: CanvasRenderingContext2D, time: number, x: number, y: number) => {
    const angle = rotation(time);
    drawTrail(ctx, time, config.trailRotate ? angle : 0);

    const origin = config.centre ? 0.5 : 0;
    const drawSprite = (image: ImageBitmap, spriteAngle: number, spriteScaleFactor: number) => {
      const size = skinImageSize(image);
      const w = size.width * spriteScale * spriteScaleFactor;
      const h = size.height * spriteScale * spriteScaleFactor;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spriteAngle);
      ctx.drawImage(image, -w * origin, -h * origin, w, h);
      ctx.restore();
    };
    if (images.cursor) drawSprite(images.cursor, angle, expandScale(time));
    if (images.cursormiddle) drawSprite(images.cursormiddle, 0, 1);
  };

  return {
    draw,
    prepare: () => {
      if (images.cursortrail && images.cursormiddle) trailFor(images.cursortrail);
    },
    setConfig: (next) => {
      config = next;
    },
  };
}
