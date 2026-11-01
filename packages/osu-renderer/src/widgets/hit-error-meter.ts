import { HitResult } from "osu-classes";
import type { HitObject, HitWindows } from "osu-simulation";
import { inQuint, outQuint, progress } from "../renderer/anim";
import type { WidgetContext, WidgetFactory } from "./widget";

// A port of lazer's BarHitErrorMeter with its default settings, in lazer's
// 1024x768 HUD units. Lazer's default skins show two: one at the left edge and
// a mirrored one at the right.
const BAR_HEIGHT = 200;
const BAR_WIDTH = 2;
const CHEVRON_SIZE = 8;
const MARGIN = 2;
const JUDGEMENT_LINE_WIDTH = 14;
const JUDGEMENT_LINE_THICKNESS = 4;
const CENTRE_MARKER_SIZE = 8;
const LABEL_SIZE = 14;
const LABEL_OFFSET = 10;
const GRADIENT_START = 0.8;

const MAX_CONCURRENT_JUDGEMENTS = 50;
const QUICK_FADE_TIME = 100;
const FADE_IN_DURATION = 100;
const FADE_OUT_DURATION = 5000;
const LINE_ALPHA = 0.6;
const ARROW_MOVE_DURATION = 800;

// OsuColour.ForHitResult.
const GREAT = "#66ccff";
const OK = "#88b300";
const MEH = "#ffcc22";
// GREAT darkened by 0.3 (osu!framework's Darken divides by 1 + amount).
const GREAT_DARK = "rgb(78, 157, 196)";

type Judgement = {
  time: number;
  /** How early (negative) or late the hit was, in ms. */
  offset: number;
  /** Position along the bar, 0 (early end) to 1 (late end). */
  position: number;
  colour: string;
  /** When too many lines were showing and this one was faded out early. */
  quickFadeTime: number | null;
  end: number;
};

const colourFor = (result: HitResult) =>
  result === HitResult.Great ? GREAT : result === HitResult.Ok ? OK : MEH;

// Only hits on objects with hit windows (circles and slider heads) are shown.
// Our hit objects carry `click` exactly when such a hit judged them.
function buildJudgements(hitObjects: HitObject[], maxHitWindow: number): Judgement[] {
  const relative = (offset: number) => Math.min(1, Math.max(0, (offset / maxHitWindow + 1) / 2));
  const judgements: Judgement[] = hitObjects
    .filter((h) => h.click && h.result !== HitResult.Miss)
    .map((h) => ({
      time: h.resultTime,
      offset: h.resultTime - h.time,
      position: relative(h.resultTime - h.time),
      colour: colourFor(h.result),
      quickFadeTime: null,
      end: h.resultTime + FADE_IN_DURATION + FADE_OUT_DURATION,
    }))
    .sort((a, b) => a.time - b.time);

  // When a judgement arrives with more than 50 lines showing, the oldest that isn't
  // already about to go is faded out over 100ms.
  const showing: Judgement[] = [];
  for (const judgement of judgements) {
    const now = judgement.time;
    for (let i = showing.length - 1; i >= 0; i--) {
      if (showing[i].end <= now) showing.splice(i, 1);
    }
    if (showing.length > MAX_CONCURRENT_JUDGEMENTS) {
      const old = showing.find((j) => j.end > now + QUICK_FADE_TIME * 1.1);
      if (old) {
        old.quickFadeTime = now;
        old.end = now + QUICK_FADE_TIME;
      }
    }
    showing.push(judgement);
  }
  return judgements;
}

function lineAlpha(j: Judgement, time: number): number {
  const elapsed = time - j.time;
  const normal =
    elapsed < FADE_IN_DURATION
      ? LINE_ALPHA * outQuint(elapsed / FADE_IN_DURATION)
      : LINE_ALPHA * (1 - progress(elapsed, FADE_IN_DURATION, FADE_OUT_DURATION));
  if (j.quickFadeTime === null || time < j.quickFadeTime) return normal;
  const atFade = lineAlpha({ ...j, quickFadeTime: null }, j.quickFadeTime);
  return atFade * (1 - progress(time, j.quickFadeTime, QUICK_FADE_TIME));
}

function lineWidth(j: Judgement, time: number): number {
  // A quick fade clears the width transforms, leaving the width where it was.
  const at = j.quickFadeTime === null ? time : Math.min(time, j.quickFadeTime);
  const elapsed = at - j.time;
  if (elapsed < FADE_IN_DURATION) return outQuint(elapsed / FADE_IN_DURATION);
  return 1 - progress(elapsed, FADE_IN_DURATION, FADE_OUT_DURATION, inQuint);
}

/**
 * The moving average arrow. Each judgement moves it towards the new average over
 * 800ms (OutQuint), starting from wherever the previous move had got to.
 */
function buildArrow(judgements: Judgement[], maxHitWindow: number) {
  const times = new Float64Array(judgements.length);
  const from = new Float64Array(judgements.length);
  const to = new Float64Array(judgements.length);
  let average = 0;
  let position = 0.5;
  judgements.forEach((j, k) => {
    average = average * 0.9 + j.offset * 0.1;
    if (k > 0) position = arrowAt(k - 1, j.time);
    times[k] = j.time;
    from[k] = position;
    to[k] = Math.min(1, Math.max(0, (average / maxHitWindow + 1) / 2));
  });

  function arrowAt(k: number, time: number): number {
    return from[k] + (to[k] - from[k]) * progress(time, times[k], ARROW_MOVE_DURATION, outQuint);
  }

  return (time: number) => {
    const k = lastAtOrBefore(times, time);
    return k < 0 ? 0.5 : arrowAt(k, time);
  };
}

function lastAtOrBefore(times: ArrayLike<number>, time: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// Lazer's labels are the hare and tortoise from its own icon font. These are
// Lucide's rabbit and turtle (ISC licence, https://lucide.dev), on a 24px grid.
const HARE = [
  "M13 16a3 3 0 0 1 2.24 5",
  "M18 12h.01",
  "M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3",
  "M20 8.54V4a2 2 0 1 0-4 0v3",
  "M7.612 12.524a3 3 0 1 0-1.6 4.3",
];
const TORTOISE = [
  "m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z",
  "M4.82 7.9 8 10",
  "M15.18 7.9 12 10",
  "M16.93 10H20a2 2 0 0 1 0 4H2",
];

function windowsOf(hitWindows: HitWindows): { colour: string; length: number }[] {
  return [
    { colour: MEH, length: hitWindows.meh },
    { colour: OK, length: hitWindows.ok },
    { colour: GREAT, length: hitWindows.great },
  ];
}

function createBarHitErrorMeter(context: WidgetContext, mirrored: boolean) {
  const { simulation, scale, canvasX, canvasY } = context;
  const windows = windowsOf(simulation.hitWindows);
  const maxHitWindow = Math.max(1, windows[0].length);
  const judgements = buildJudgements(simulation.hitObjects, maxHitWindow);
  const judgementTimes = judgements.map((j) => j.time);
  const arrowAt = buildArrow(judgements, maxHitWindow);
  const hare = HARE.map((d) => new Path2D(d));
  const tortoise = TORTOISE.map((d) => new Path2D(d));

  // Everything below is drawn in HUD units from the meter's left edge and vertical
  // centre; the mirrored meter flips that horizontally about its right edge.
  const barsX = MARGIN + CHEVRON_SIZE + JUDGEMENT_LINE_WIDTH / 2;
  const top = -BAR_HEIGHT / 2;

  const drawColourBars = (ctx: CanvasRenderingContext2D) => {
    const half = BAR_HEIGHT / 2;
    const x = barsX - BAR_WIDTH / 2;
    windows.forEach(({ colour, length }, i) => {
      const height = (length / maxHitWindow) * half;
      for (const direction of [-1, 1]) {
        if (i === 0) {
          // The widest window fades out over its last 20%.
          ctx.fillStyle = colour;
          ctx.fillRect(x, 0, BAR_WIDTH, direction * height * GRADIENT_START);
          const gradient = ctx.createLinearGradient(
            0,
            direction * half * GRADIENT_START,
            0,
            direction * (half * GRADIENT_START + height * (1 - GRADIENT_START)),
          );
          gradient.addColorStop(0, colour);
          gradient.addColorStop(1, `${colour}00`);
          ctx.fillStyle = gradient;
          ctx.fillRect(
            x,
            direction * half * GRADIENT_START,
            BAR_WIDTH,
            direction * height * (1 - GRADIENT_START),
          );
        } else {
          ctx.fillStyle = colour;
          ctx.fillRect(x, 0, BAR_WIDTH, direction * height);
        }
      }
    });
  };

  const drawCircle = (ctx: CanvasRenderingContext2D, size: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(barsX, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawJudgements = (ctx: CanvasRenderingContext2D, time: number) => {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const first = lastAtOrBefore(judgementTimes, time - FADE_IN_DURATION - FADE_OUT_DURATION) + 1;
    const last = lastAtOrBefore(judgementTimes, time);
    for (let i = first; i <= last; i++) {
      const j = judgements[i];
      if (time >= j.end) continue;
      const width = JUDGEMENT_LINE_WIDTH * lineWidth(j, time);
      const alpha = lineAlpha(j, time);
      if (width <= 0 || alpha <= 0) continue;
      const height = JUDGEMENT_LINE_THICKNESS;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = j.colour;
      ctx.beginPath();
      ctx.roundRect(
        barsX - width / 2,
        top + j.position * BAR_HEIGHT - height / 2,
        width,
        height,
        Math.min(width, height) / 2,
      );
      ctx.fill();
    }
    ctx.restore();
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, time: number) => {
    const y = top + arrowAt(time) * BAR_HEIGHT;
    const x = MARGIN + CHEVRON_SIZE / 2;
    const s = CHEVRON_SIZE;
    ctx.strokeStyle = "white";
    ctx.lineWidth = s * 0.25;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.18, y - s * 0.38);
    ctx.lineTo(x + s * 0.2, y);
    ctx.lineTo(x - s * 0.18, y + s * 0.38);
    ctx.stroke();
  };

  // Labels stay upright (unmirrored), as lazer's UprightAspectMaintainingContainer keeps them.
  const drawLabel = (ctx: CanvasRenderingContext2D, icon: Path2D[], y: number) => {
    ctx.save();
    ctx.translate(barsX, y);
    if (mirrored) ctx.scale(-1, 1);
    const unit = LABEL_SIZE / 24;
    ctx.scale(unit, unit);
    ctx.translate(-12, -12);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const path of icon) ctx.stroke(path);
    ctx.restore();
  };

  return {
    draw(ctx: CanvasRenderingContext2D, time: number) {
      ctx.save();
      ctx.translate(canvasX, canvasY);
      ctx.scale(mirrored ? -scale : scale, scale);
      drawCircle(ctx, CENTRE_MARKER_SIZE, GREAT);
      drawColourBars(ctx);
      drawJudgements(ctx, time);
      drawCircle(ctx, CENTRE_MARKER_SIZE / 2, GREAT_DARK);
      drawLabel(ctx, hare, top - LABEL_OFFSET);
      drawLabel(ctx, tortoise, -top + LABEL_OFFSET);
      drawArrow(ctx, time);
      ctx.restore();
    },
  };
}

/** Lazer's default hit error meter, for the left edge (anchor "center-left"). */
export const hitErrorMeterWidget: WidgetFactory = (context) => {
  const meter = createBarHitErrorMeter(context, false);
  return { draw: (ctx, _frame, time) => meter.draw(ctx, time) };
};

/** The mirrored meter lazer's default skins show at the right edge (anchor "center-right"). */
export const mirroredHitErrorMeterWidget: WidgetFactory = (context) => {
  const meter = createBarHitErrorMeter(context, true);
  return { draw: (ctx, _frame, time) => meter.draw(ctx, time) };
};
