import { HitResult } from "osu-classes";
import type { HitObject, SimulatedFrames } from "osu-simulation";
import { StandardAction } from "osu-standard-stable";
import { partitionPoint } from "../math";

const FULL_OPACITY_DURATION = 300;
const FADE_DURATION = 300;
const DASH_LENGTH = 12;
const GAP_LENGTH = 8;
const LINE_WIDTH = 8;
const MISS_MARKER_LENGTH = 16;
const MISS_MARKER_WIDTH = 8;
const STRAY_CLICK_MARKER_LENGTH = 9;
const STRAY_CLICK_MARKER_WIDTH = 5;
const HIT_MARKER_RADIUS = 10;
// How far from a marker's centre the pointer can be to hover it, in canvas pixels.
const HOVER_RADIUS = 20;

// Judgement colours in osu!'s usual scheme: blue 300, green 100, yellow 50, red miss.
// Hits are dots and misses are crosses. A click that judged nothing is a smaller white cross.
const STRAY_CLICK_COLOR = "white";
export const RESULT_COLORS: Partial<Record<HitResult, string>> = {
  [HitResult.Perfect]: "#66ccff",
  [HitResult.Great]: "#66ccff",
  [HitResult.Good]: "#88b300",
  [HitResult.Ok]: "#88b300",
  [HitResult.Meh]: "#ffcc22",
  [HitResult.Miss]: "#ff4444",
  [HitResult.IgnoreMiss]: "#ff4444",
};

/**
 * A judgement of `hitObject` in canvas coordinates. A `clicked` one is drawn at
 * the cursor on the click frame at `time`; the rest (timed-out misses, slider
 * ends, spinners) are drawn at the object.
 */
export type AnalysisJudgement = {
  hitObject: HitObject;
  time: number;
  result: HitResult;
  x: number;
  y: number;
  clicked: boolean;
};

/**
 * A judgement marker under the pointer. `x` and `y` are its canvas position;
 * `radius` is the circle radius in osu! pixels, to compare click distances with.
 */
export type JudgementMarker = {
  hitObject: HitObject;
  result: HitResult;
  x: number;
  y: number;
  radius: number;
};

type Marker = {
  time: number;
  x: number;
  y: number;
  color: string;
  kind: MarkerKind;
  judgement?: AnalysisJudgement;
};
type MarkerKind = "hit" | "miss" | "stray";

const kindOf = (result: HitResult): MarkerKind =>
  result === HitResult.Miss || result === HitResult.IgnoreMiss ? "miss" : "hit";

export type CursorAnalysis = {
  draw: (ctx: CanvasRenderingContext2D, time: number) => void;
  setVisible: (visible: boolean) => void;
  /** The judgement marker drawn nearest canvas point (x, y) at `time`, if any is close. */
  markerAt: (x: number, y: number, time: number) => JudgementMarker | undefined;
};

export function createCursorAnalysis({
  frames,
  judgements,
  radius,
  scale,
  offsetX,
  offsetY,
}: {
  frames: SimulatedFrames;
  judgements: AnalysisJudgement[];
  radius: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}): CursorAnalysis {
  let visible = false;
  const markers = buildMarkers(frames, judgements, scale, offsetX, offsetY);

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
      partitionPoint(frames.time, 0, frames.length, (t) => t <= windowStart) - 1,
    );
    const endIdx = partitionPoint(frames.time, 0, frames.length, (t) => t <= time);
    if (endIdx <= startIdx) return;

    // Draw all dashed lines first
    for (let i = startIdx; i < endIdx - 1; i++) {
      const age = time - frames.time[i + 1];
      const alpha = calcAlpha(age);
      if (alpha <= 0) continue;

      const x1 = frames.x[i] * scale + offsetX;
      const y1 = frames.y[i] * scale + offsetY;
      const x2 = frames.x[i + 1] * scale + offsetX;
      const y2 = frames.y[i + 1] * scale + offsetY;

      drawDashedLine(ctx, x1, y1, x2, y2, alpha);
    }

    // Draw markers on top.
    for (const marker of visibleMarkers(time)) {
      drawMarker(ctx, marker, calcAlpha(time - marker.time));
    }
  }

  function* visibleMarkers(time: number): Generator<Marker> {
    const windowStart = time - FULL_OPACITY_DURATION - FADE_DURATION;
    const start = partitionPoint(markers, 0, markers.length, (m) => m.time <= windowStart);
    const end = partitionPoint(markers, start, markers.length, (m) => m.time <= time);
    for (let i = start; i < end; i++) {
      if (calcAlpha(time - markers[i].time) > 0) yield markers[i];
    }
  }

  function markerAt(x: number, y: number, time: number): JudgementMarker | undefined {
    if (!visible) return undefined;
    let nearest: Marker | undefined;
    let nearestDistance = HOVER_RADIUS;
    for (const marker of visibleMarkers(time)) {
      const distance = Math.hypot(marker.x - x, marker.y - y);
      if (marker.judgement && distance <= nearestDistance) {
        nearest = marker;
        nearestDistance = distance;
      }
    }
    if (!nearest?.judgement) return undefined;
    const { hitObject, result } = nearest.judgement;
    return { hitObject, result, x: nearest.x, y: nearest.y, radius };
  }

  function setVisible(v: boolean): void {
    visible = v;
  }

  return { draw, setVisible, markerAt };
}

const BUTTONS = (1 << StandardAction.LeftButton) | (1 << StandardAction.RightButton);

// One marker per click, coloured by the judgement it made, plus one per judgement
// that no click made. Sorted by time.
function buildMarkers(
  frames: SimulatedFrames,
  judgements: AnalysisJudgement[],
  scale: number,
  offsetX: number,
  offsetY: number,
): Marker[] {
  const clickJudgements = new Map<number, AnalysisJudgement>();
  const markers: Marker[] = [];
  for (const judgement of judgements) {
    if (judgement.clicked) {
      clickJudgements.set(judgement.time, judgement);
    } else {
      const color = RESULT_COLORS[judgement.result];
      if (!color) continue;
      const { time, x, y, result } = judgement;
      markers.push({ time, x, y, color, kind: kindOf(result), judgement });
    }
  }

  for (let i = 1; i < frames.length; i++) {
    if (!isClick(frames, i)) continue;
    const judgement = clickJudgements.get(frames.time[i]);
    markers.push({
      time: frames.time[i],
      x: frames.x[i] * scale + offsetX,
      y: frames.y[i] * scale + offsetY,
      color: (judgement && RESULT_COLORS[judgement.result]) || STRAY_CLICK_COLOR,
      kind: judgement ? kindOf(judgement.result) : "stray",
      judgement,
    });
  }

  return markers.sort((a, b) => a.time - b.time);
}

// Whether frame `i` presses a button that frame `i - 1` didn't hold.
function isClick(frames: SimulatedFrames, i: number): boolean {
  return (frames.actions[i] & ~frames.actions[i - 1] & BUTTONS) !== 0;
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

function drawMarker(ctx: CanvasRenderingContext2D, marker: Marker, alpha: number): void {
  const { x, y, color, kind } = marker;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha * 1.5);
  ctx.beginPath();
  if (kind === "hit") {
    ctx.fillStyle = color;
    ctx.arc(x, y, HIT_MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const s = kind === "miss" ? MISS_MARKER_LENGTH : STRAY_CLICK_MARKER_LENGTH;
    ctx.strokeStyle = color;
    ctx.lineWidth = kind === "miss" ? MISS_MARKER_WIDTH : STRAY_CLICK_MARKER_WIDTH;
    ctx.lineCap = "round";
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
  }
  ctx.restore();
}
