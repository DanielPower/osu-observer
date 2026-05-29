import type { SimulatedFrame } from "osu-simulation";
import { StandardAction } from "osu-standard-stable";
import { partitionPoint } from "../math";

const FULL_OPACITY_DURATION = 300;
const FADE_DURATION = 300;
const DASH_LENGTH = 12;
const GAP_LENGTH = 8;
const LINE_WIDTH = 8;
const CLICK_MARKER_LENGTH = 16;
const CLICK_MARKER_WIDTH = 8;

export type CursorAnalysis = {
  draw: (ctx: CanvasRenderingContext2D, time: number) => void;
  setVisible: (visible: boolean) => void;
};

export function createCursorAnalysis({
  frames,
  scale,
  offsetX,
  offsetY,
}: {
  frames: SimulatedFrame[];
  scale: number;
  offsetX: number;
  offsetY: number;
}): CursorAnalysis {
  let visible = false;

  // Full opacity for FULL_OPACITY_DURATION, then linear fade over FADE_DURATION
  function calcAlpha(age: number): number {
    if (age <= FULL_OPACITY_DURATION) return 0.7;
    return Math.max(0, 1 - (age - FULL_OPACITY_DURATION) / FADE_DURATION) * 0.7;
  }

  function draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (!visible) return;

    const totalDuration = FULL_OPACITY_DURATION + FADE_DURATION;
    const windowStart = time - totalDuration;
    // Start from the frame just before the window so we have a segment into it
    const startIdx = Math.max(
      0,
      partitionPoint(frames, 0, frames.length, (f) => f.time <= windowStart) - 1,
    );
    const endIdx = partitionPoint(frames, 0, frames.length, (f) => f.time <= time);
    if (endIdx <= startIdx) return;

    // Draw all dashed lines first
    for (let i = startIdx; i < endIdx - 1; i++) {
      const frame = frames[i];
      const nextFrame = frames[i + 1];

      const age = time - nextFrame.time;
      const alpha = calcAlpha(age);
      if (alpha <= 0) continue;

      const x1 = frame.x * scale + offsetX;
      const y1 = frame.y * scale + offsetY;
      const x2 = nextFrame.x * scale + offsetX;
      const y2 = nextFrame.y * scale + offsetY;

      drawDashedLine(ctx, x1, y1, x2, y2, alpha);
    }

    // Draw all click markers on top.
    // Check click on first visible frame (compare with frame before it).
    if (startIdx > 0 && startIdx < endIdx) {
      const prev = frames[startIdx - 1];
      const frame = frames[startIdx];
      if (isClick(prev, frame)) {
        const alpha = calcAlpha(time - frame.time);
        if (alpha > 0) {
          drawClickMarker(ctx, frame.x * scale + offsetX, frame.y * scale + offsetY, alpha);
        }
      }
    }

    for (let i = startIdx; i < endIdx - 1; i++) {
      const frame = frames[i];
      const nextFrame = frames[i + 1];

      const age = time - nextFrame.time;
      const alpha = calcAlpha(age);
      if (alpha <= 0) continue;

      if (isClick(frame, nextFrame)) {
        drawClickMarker(ctx, nextFrame.x * scale + offsetX, nextFrame.y * scale + offsetY, alpha);
      }
    }
  }

  function setVisible(v: boolean): void {
    visible = v;
  }

  return { draw, setVisible };
}

function isClick(prev: SimulatedFrame, curr: SimulatedFrame): boolean {
  return (
    (!prev.actions.includes(StandardAction.LeftButton) &&
      curr.actions.includes(StandardAction.LeftButton)) ||
    (!prev.actions.includes(StandardAction.RightButton) &&
      curr.actions.includes(StandardAction.RightButton))
  );
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  alpha: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.5) return;

  const nx = dx / dist;
  const ny = dy / dist;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "white";
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "round";

  ctx.beginPath();
  let drawn = 0;
  while (drawn < dist) {
    const dashEnd = Math.min(drawn + DASH_LENGTH, dist);
    ctx.moveTo(x1 + nx * drawn, y1 + ny * drawn);
    ctx.lineTo(x1 + nx * dashEnd, y1 + ny * dashEnd);
    drawn = dashEnd + GAP_LENGTH;
  }
  ctx.stroke();
  ctx.restore();
}

function drawClickMarker(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number): void {
  const s = CLICK_MARKER_LENGTH;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha * 1.5);
  ctx.strokeStyle = "#ff4444";
  ctx.lineWidth = CLICK_MARKER_WIDTH;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.restore();
}
