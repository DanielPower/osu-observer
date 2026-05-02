import { Graphics } from "pixi.js";
import type { SimulatedFrame } from "osu-simulation";
import { StandardAction } from "osu-standard-stable";

const FULL_OPACITY_DURATION = 300;
const FADE_DURATION = 300;
const DASH_LENGTH = 12;
const GAP_LENGTH = 8;
const LINE_COLOR = 0xffffff;
const LINE_WIDTH = 8;
const CLICK_MARKER_LENGTH = 16;
const CLICK_MARKER_WIDTH = 8;
const CLICK_MARKER_COLOR = 0xff4444;

export type CursorAnalysis = {
  graphics: Graphics;
  update: (time: number) => void;
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
  const graphics = new Graphics();
  let visible = false;

  // Binary search: find index of first frame with time > target
  function upperBound(target: number): number {
    let low = 0;
    let high = frames.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (frames[mid].time > target) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  }

  // Full opacity for FULL_OPACITY_DURATION, then linear fade over FADE_DURATION
  function calcAlpha(age: number): number {
    if (age <= FULL_OPACITY_DURATION) return 0.7;
    return Math.max(0, 1 - (age - FULL_OPACITY_DURATION) / FADE_DURATION) * 0.7;
  }

  function update(time: number): void {
    graphics.clear();
    if (!visible) return;

    const totalDuration = FULL_OPACITY_DURATION + FADE_DURATION;
    const windowStart = time - totalDuration;
    // Start from the frame just before the window so we have a segment into it
    const startIdx = Math.max(0, upperBound(windowStart) - 1);
    const endIdx = upperBound(time);
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

      drawDashedLine(graphics, x1, y1, x2, y2, alpha);
    }

    // Draw all click markers on top
    // Check click on first visible frame (compare with frame before it)
    if (startIdx > 0 && startIdx < endIdx) {
      const prev = frames[startIdx - 1];
      const frame = frames[startIdx];
      if (isClick(prev, frame)) {
        const alpha = calcAlpha(time - frame.time);
        if (alpha > 0) {
          drawClickMarker(
            graphics,
            frame.x * scale + offsetX,
            frame.y * scale + offsetY,
            alpha,
          );
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
        drawClickMarker(
          graphics,
          nextFrame.x * scale + offsetX,
          nextFrame.y * scale + offsetY,
          alpha,
        );
      }
    }
  }

  function setVisible(v: boolean): void {
    visible = v;
    if (!v) graphics.clear();
  }

  return { graphics, update, setVisible };
}

function isClick(prev: SimulatedFrame, curr: SimulatedFrame): boolean {
  return (
    (!prev.actions.has(StandardAction.LeftButton) &&
      curr.actions.has(StandardAction.LeftButton)) ||
    (!prev.actions.has(StandardAction.RightButton) &&
      curr.actions.has(StandardAction.RightButton))
  );
}

function drawDashedLine(
  g: Graphics,
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
  let drawn = 0;

  while (drawn < dist) {
    const dashEnd = Math.min(drawn + DASH_LENGTH, dist);
    g.moveTo(x1 + nx * drawn, y1 + ny * drawn);
    g.lineTo(x1 + nx * dashEnd, y1 + ny * dashEnd);
    drawn = dashEnd + GAP_LENGTH;
  }

  g.stroke({ width: LINE_WIDTH, color: LINE_COLOR, alpha });
}

function drawClickMarker(
  g: Graphics,
  x: number,
  y: number,
  alpha: number,
): void {
  const s = CLICK_MARKER_LENGTH;
  g.moveTo(x - s, y - s);
  g.lineTo(x + s, y + s);
  g.moveTo(x + s, y - s);
  g.lineTo(x - s, y + s);
  g.stroke({
    width: CLICK_MARKER_WIDTH,
    color: CLICK_MARKER_COLOR,
    alpha: Math.min(1, alpha * 1.5),
  });
}
