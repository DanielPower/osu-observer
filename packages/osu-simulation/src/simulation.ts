import { HitResult, type Beatmap, type HitType, type Replay } from "osu-classes";
import {
  StandardAction,
  StandardBeatmap,
  type StandardReplayFrame,
  Slider,
  Spinner as StandardSpinner,
} from "osu-standard-stable";
import { calcObjectRadius, PLAYFIELD } from "./math";
import type { ReplayFrames } from "./replay";
import { applyMods, clockRateFor, scoreMultiplierFor, type LazerMod } from "./mods";

export type Coordinate = {
  x: number;
  y: number;
};

export type HitCircle = {
  x: number;
  y: number;
  time: number;
  resultTime: number;
  result: HitResult;
};

export type SliderData = {
  path: Coordinate[];
  repeats: number;
  duration: number;
  velocity: number;
  tickPositions: { position: Coordinate; time: number }[];
  repeatPositions: { position: Coordinate; time: number }[];
  endPosition: Coordinate;
};

export type HitObject = {
  x: number;
  y: number;
  time: number;
  resultTime: number;
  result: HitResult;
  type: HitType;
  endTime?: number;
  totalRotation?: number;
  // Sliders are judged as two separate components: the head (`result`/`resultTime`,
  // judged on click) and the tail (`endResult`/`endResultTime`, judged on whether the
  // player was tracking at the slider's end).
  endResult?: HitResult;
  endResultTime?: number;
  // Set when a click judged the head, so the click frame sits at `resultTime`.
  // Absent for misses from timing out or from note lock passing them over.
  click?: ClickStats;
};

/** Where and when a circle or slider head was clicked, in osu! pixels and ms. */
export type ClickStats = {
  x: number;
  y: number;
  /** Click time minus the object's time: negative is early. */
  timing: number;
  /** From the object's centre. */
  distance: number;
  /**
   * The click's offset along the line from the previous object's end to this
   * object: positive overshoots, negative undershoots. Absent for the first
   * object, after a spinner, and when the two objects sit on top of each other.
   */
  overshoot?: number;
  /**
   * Degrees between that line and the line from the previous object's end to
   * the click, so 0 sits exactly on it. Positive is clockwise on screen.
   * Absent whenever `overshoot` is.
   */
  angle?: number;
};

export type SimulatedFrame = {
  x: number;
  y: number;
  time: number;
  score: number;
  combo: number;
  great: number;
  good: number;
  okay: number;
  miss: number;
  accuracy: number;
  actions: StandardAction[];
  currentSpinnerRotation?: number;
  activeSliderProgress?: number;
};

/**
 * The simulated frames, one typed array per field, so a worker can transfer them
 * to the page without copying (see simulationTransferables). `actions` holds
 * StandardAction bits (1 << action), and NaN marks a frame without a spinner
 * rotation or slider progress.
 */
export type SimulatedFrames = {
  length: number;
  x: Float64Array;
  y: Float64Array;
  time: Float64Array;
  score: Float64Array;
  combo: Int32Array;
  great: Int32Array;
  good: Int32Array;
  okay: Int32Array;
  miss: Int32Array;
  accuracy: Float64Array;
  actions: Uint8Array;
  currentSpinnerRotation: Float64Array;
  activeSliderProgress: Float64Array;
};

export type Simulation = {
  hitObjects: HitObject[];
  frames: SimulatedFrames;
};

function createSimulatedFrames(length: number): SimulatedFrames {
  return {
    length,
    x: new Float64Array(length),
    y: new Float64Array(length),
    time: new Float64Array(length),
    score: new Float64Array(length),
    combo: new Int32Array(length),
    great: new Int32Array(length),
    good: new Int32Array(length),
    okay: new Int32Array(length),
    miss: new Int32Array(length),
    accuracy: new Float64Array(length),
    actions: new Uint8Array(length),
    currentSpinnerRotation: new Float64Array(length),
    activeSliderProgress: new Float64Array(length),
  };
}

/** The buffers to transfer when posting a simulation to another thread. */
export const simulationTransferables = ({ frames }: Simulation): ArrayBuffer[] =>
  Object.values(frames).flatMap((column) =>
    ArrayBuffer.isView(column) ? [column.buffer as ArrayBuffer] : [],
  );

const optionalValue = (value: number) => (Number.isNaN(value) ? undefined : value);

/** Frame `i` as an object. */
export function frameAt(frames: SimulatedFrames, i: number): SimulatedFrame {
  return {
    x: frames.x[i],
    y: frames.y[i],
    time: frames.time[i],
    score: frames.score[i],
    combo: frames.combo[i],
    great: frames.great[i],
    good: frames.good[i],
    okay: frames.okay[i],
    miss: frames.miss[i],
    accuracy: frames.accuracy[i],
    actions: actionsFrom(frames.actions[i]),
    currentSpinnerRotation: optionalValue(frames.currentSpinnerRotation[i]),
    activeSliderProgress: optionalValue(frames.activeSliderProgress[i]),
  };
}

/** The number of frames at or before `time`, so the frame showing at `time` is the one before it. */
export function frameIndexAt(frames: SimulatedFrames, time: number): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames.time[mid] <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const isInside = (cx: number, cy: number, hx: number, hy: number, hr: number) =>
  Math.sqrt((cx - hx) ** 2 + (cy - hy) ** 2) < hr;

const getCursorAngle = (x: number, y: number): number =>
  Math.atan2(y - PLAYFIELD.centerY, x - PLAYFIELD.centerX);

const getAngularDifference = (angle1: number, angle2: number): number => {
  let diff = angle2 - angle1;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
};

const HIT_TYPE_SLIDER = 1 << 1;
const HIT_TYPE_SPINNER = 1 << 3;

type StandardHitObject = StandardBeatmap["hitObjects"][number];

const isSlider = (hitObject: StandardHitObject): boolean =>
  (hitObject.hitType & HIT_TYPE_SLIDER) !== 0;

const isSpinner = (hitObject: StandardHitObject): boolean =>
  (hitObject.hitType & HIT_TYPE_SPINNER) !== 0;

// osu!lazer ScoreProcessor constants.
const COMBO_EXPONENT = 0.5;
const SCORE_GREAT = 300;
const SCORE_OK = 100;
const SCORE_MEH = 50;
const SCORE_LARGE_TICK = 30;
const SCORE_TAIL = 150;
const SCORE_SMALL_BONUS = 10;
const SCORE_LARGE_BONUS = 50;

// osu!lazer slider tracking/judgement constants.
// The follow circle allows tracking within 2.4x the object radius; the tail is
// judged 36ms before the slider's end time (SliderEventGenerator.TAIL_LENIENCY).
const SLIDER_TRACKING_RADIUS_MULTIPLIER = 2.4;
const TAIL_LENIENCY_MS = 36;

const CLEAR_RPM_OD0 = 90;
const CLEAR_RPM_OD5 = 150;
const CLEAR_RPM_OD10 = 225;
const COMPLETE_RPM_OD0 = 250;
const COMPLETE_RPM_OD5 = 380;
const COMPLETE_RPM_OD10 = 430;
const BONUS_SPINS_GAP = 2;

function difficultyRange(difficulty: number, min: number, mid: number, max: number): number {
  if (difficulty > 5) return mid + ((max - mid) * (difficulty - 5)) / 5;
  if (difficulty < 5) return mid - ((mid - min) * (5 - difficulty)) / 5;
  return mid;
}

function calcSpinsRequired(durationMs: number, od: number): number {
  const rpm = difficultyRange(od, CLEAR_RPM_OD0, CLEAR_RPM_OD5, CLEAR_RPM_OD10);
  return Math.floor((rpm / 60) * (durationMs / 1000) + 0.0001);
}

/**
 * Maximum bonus spins beyond SpinsRequired + gap.
 * Uses COMPLETE_RPM DifficultyRange.
 */
function calcMaxBonusSpins(durationMs: number, od: number, spinsRequired: number): number {
  const rpm = difficultyRange(od, COMPLETE_RPM_OD0, COMPLETE_RPM_OD5, COMPLETE_RPM_OD10);
  const maxSpins = Math.floor((rpm / 60) * (durationMs / 1000) + 0.0001);
  return Math.max(0, maxSpins - spinsRequired - BONUS_SPINS_GAP);
}

/**
 * Hit windows from OD. Source: osu!lazer OsuHitWindows.cs.
 *
 * Lazer maps each DifficultyRange, then applies `floor(window) - 0.5`.
 * This matters at integer replay-frame boundaries: for OD 8.5, the raw
 * Great window is 29ms, but lazer's actual Great window is 28.5ms, so a
 * -29ms hit is Ok rather than Great.
 *
 *   Great: floor(DifficultyRange(80,  50,  20)) - 0.5
 *   Ok:    floor(DifficultyRange(140, 100, 60)) - 0.5
 *   Meh:   floor(DifficultyRange(200, 150, 100)) - 0.5
 *   Miss:  400 ms (fixed)
 */
function calcHitWindows(od: number) {
  const lazerWindow = (min: number, mid: number, max: number): number =>
    Math.floor(difficultyRange(od, min, mid, max)) - 0.5;

  return {
    great: lazerWindow(80, 50, 20),
    ok: lazerWindow(140, 100, 60),
    meh: lazerWindow(200, 150, 100),
    miss: 400,
  } as const;
}

type HitWindows = ReturnType<typeof calcHitWindows>;

/** Map an absolute time offset (ms) to a HitResult using the given windows. */
function resultForOffset(absOffset: number, windows: HitWindows): HitResult {
  if (absOffset <= windows.great) return HitResult.Great;
  if (absOffset <= windows.ok) return HitResult.Ok;
  if (absOffset <= windows.meh) return HitResult.Meh;
  return HitResult.Miss;
}

const comboScore = (combo: number, baseScore: number = SCORE_GREAT): number =>
  baseScore * Math.pow(combo, COMBO_EXPONENT);

// A slider's scored sub-components, in time order: each tick and repeat
// is a "large tick" (30), and the slider ends with a tail (150). Each is judged
// individually based on whether the player is tracking when its time is reached.
type SliderEvent = { time: number; base: number; isTail: boolean };

const buildSliderEvents = (sliderData: SliderData, endTime: number): SliderEvent[] => {
  const events: SliderEvent[] = [];
  for (const tick of sliderData.tickPositions) {
    events.push({ time: tick.time, base: SCORE_LARGE_TICK, isTail: false });
  }
  for (const repeat of sliderData.repeatPositions) {
    events.push({ time: repeat.time, base: SCORE_LARGE_TICK, isTail: false });
  }
  events.push({ time: endTime - TAIL_LENIENCY_MS, base: SCORE_TAIL, isTail: true });
  events.sort((a, b) => a.time - b.time);
  return events;
};

/** A slider's path, ticks and repeats in playfield coordinates. */
export const extractSliderData = (slider: Slider): SliderData => {
  const origin = slider.stackedStartPosition;
  const path: Coordinate[] = slider.path.path.map((p) => ({
    x: p.x + origin.x,
    y: p.y + origin.y,
  }));

  const tickPositions: { position: Coordinate; time: number }[] = [];
  const spanDuration = slider.spanDuration;

  if (slider.tickDistance > 0 && slider.velocity > 0) {
    const tickInterval = slider.tickDistance / slider.velocity;
    for (let span = 0; span < slider.spans; span++) {
      const spanStartTime = slider.startTime + span * spanDuration;
      const isReverse = span % 2 === 1;
      let tickTime = tickInterval;
      while (tickTime < spanDuration - 1) {
        const progress = tickTime / spanDuration;
        const pathProgress = isReverse ? 1 - progress : progress;
        const position = slider.path.positionAt(pathProgress);
        tickPositions.push({
          position: {
            x: position.x + origin.x,
            y: position.y + origin.y,
          },
          time: spanStartTime + tickTime,
        });
        tickTime += tickInterval;
      }
    }
  }

  const pathTip = path[path.length - 1];
  const pathStart = path[0];

  const repeatPositions: { position: Coordinate; time: number }[] = [];
  for (let i = 1; i < slider.spans; i++) {
    const isAtEnd = i % 2 === 1;
    const position = isAtEnd ? pathTip : pathStart;
    repeatPositions.push({
      position: { x: position.x, y: position.y },
      time: slider.startTime + i * spanDuration,
    });
  }

  return {
    path,
    repeats: slider.repeats,
    duration: slider.duration,
    velocity: slider.velocity,
    tickPositions,
    repeatPositions,
    endPosition: pathTip,
  };
};

const getSliderBallPosition = (
  slider: Slider,
  time: number,
): { position: Coordinate; progress: number } | null => {
  if (time < slider.startTime || time > slider.endTime) return null;

  const elapsed = time - slider.startTime;
  const spanDuration = slider.spanDuration;
  const span = Math.floor(elapsed / spanDuration);
  const progressInSpan = (elapsed - span * spanDuration) / spanDuration;
  const isReverse = span % 2 === 1;
  const pathProgress = isReverse ? 1 - progressInSpan : progressInSpan;

  const localPosition = slider.path.positionAt(Math.min(1, Math.max(0, pathProgress)));
  const origin = slider.stackedStartPosition;
  return {
    position: {
      x: localPosition.x + origin.x,
      y: localPosition.y + origin.y,
    },
    progress: progressInSpan,
  };
};

type ScoreState = {
  combo: number;
  great: number;
  good: number;
  okay: number;
  miss: number;
  currentComboPortion: number;
  currentBaseScore: number;
  currentMaxBaseScore: number;
  judgedAccuracyCount: number;
  bonusPortion: number;
};

function createScoreState(): ScoreState {
  return {
    combo: 0,
    great: 0,
    good: 0,
    okay: 0,
    miss: 0,
    currentComboPortion: 0,
    currentBaseScore: 0,
    currentMaxBaseScore: 0,
    judgedAccuracyCount: 0,
    bonusPortion: 0,
  };
}

function applyAccuracyResult(state: ScoreState, result: HitResult): void {
  state.currentMaxBaseScore += SCORE_GREAT;
  state.judgedAccuracyCount++;

  if (result === HitResult.Miss) {
    state.miss++;
    state.combo = 0;
    return;
  }

  state.combo++;
  state.currentComboPortion += comboScore(state.combo);

  switch (result) {
    case HitResult.Great:
      state.currentBaseScore += SCORE_GREAT;
      state.great++;
      break;
    case HitResult.Ok:
      state.currentBaseScore += SCORE_OK;
      state.good++;
      break;
    case HitResult.Meh:
      state.currentBaseScore += SCORE_MEH;
      state.okay++;
      break;
  }
}

// Apply a slider tick, repeat or tail. In lazer these count towards accuracy at
// their own base score (LargeTickHit 30, SliderTailHit 150). A missed tick or
// repeat (LargeTickMiss) breaks combo; a missed tail is IgnoreMiss, which doesn't.
function applySliderEvent(state: ScoreState, event: SliderEvent, hit: boolean): void {
  state.currentMaxBaseScore += event.base;
  state.judgedAccuracyCount++;

  if (!hit) {
    if (!event.isTail) state.combo = 0;
    return;
  }
  state.combo++;
  state.currentBaseScore += event.base;
  state.currentComboPortion += comboScore(state.combo, event.base);
}

type ScoringTotals = {
  maxComboPortion: number;
  totalAccuracyCount: number;
};

function calculateMaxScoringTotals(
  beatmap: StandardBeatmap,
  sliderEventsCache: Map<number, SliderEvent[]>,
): ScoringTotals {
  let maxComboPortion = 0;
  let totalAccuracyCount = 0;
  let combo = 0;

  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const hitObject = beatmap.hitObjects[i];
    combo++;
    maxComboPortion += comboScore(combo);
    totalAccuracyCount++;

    if (isSlider(hitObject)) {
      // Head is scored above; each tick/repeat/tail continues the combo.
      for (const event of sliderEventsCache.get(i)!) {
        combo++;
        totalAccuracyCount++;
        maxComboPortion += comboScore(combo, event.base);
      }
    }
  }

  return { maxComboPortion, totalAccuracyCount };
}

// C#'s Math.Round, which rounds halves to even.
const roundHalfEven = (value: number) => {
  const rounded = Math.round(value);
  return rounded - value === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded;
};

function calculateLazerScore(
  state: ScoreState,
  scoringTotals: ScoringTotals,
  scoreMultiplier: number,
): { accuracy: number; score: number } {
  const accuracy =
    state.currentMaxBaseScore > 0 ? state.currentBaseScore / state.currentMaxBaseScore : 1;
  const comboProgress =
    scoringTotals.maxComboPortion > 0
      ? state.currentComboPortion / scoringTotals.maxComboPortion
      : 1;
  const accuracyProgress =
    scoringTotals.totalAccuracyCount > 0
      ? state.judgedAccuracyCount / scoringTotals.totalAccuracyCount
      : 1;

  return {
    accuracy,
    score: roundHalfEven(
      roundHalfEven(
        500000 * accuracy * comboProgress +
          500000 * Math.pow(accuracy, 5) * accuracyProgress +
          state.bonusPortion,
      ) * scoreMultiplier,
    ),
  };
}

// A hit circle or slider head: the objects that receive clicks and take part in
// note lock (lazer's DrawableHitCircle).
type Hittable = {
  x: number;
  y: number;
  time: number;
  preempt: number;
  result: HitResult | null;
  resultTime: number | null;
  click: Coordinate | null;
};

type SliderState = {
  hitObject: Slider;
  events: SliderEvent[];
  nextEventIndex: number;
  head: Hittable;
  tracking: boolean;
  tailResult: HitResult | null;
  tailResultTime: number | null;
  finished: boolean;
};

type SpinnerState = {
  hitObject: StandardSpinner;
  /** Full spins plus the furthest progress into the current spin, as lazer's SpinnerSpinHistory counts it. */
  totalRotation: number;
  completedSpins: number;
  /** Signed rotation since the last completed spin. */
  currentSpinRotation: number;
  currentSpinMaxRotation: number;
  lastAngle: number | null;
  result: HitResult | null;
  resultTime: number | null;
  finished: boolean;
};

type ObjectState =
  | { kind: "circle"; hitObject: StandardHitObject; head: Hittable }
  | { kind: "slider"; hitObject: Slider; head: Hittable; slider: SliderState }
  | { kind: "spinner"; hitObject: StandardSpinner; spinner: SpinnerState };

const isObjectFinished = (object: ObjectState): boolean => {
  switch (object.kind) {
    case "circle":
      return object.head.result !== null;
    case "slider":
      return object.head.result !== null && object.slider.finished;
    case "spinner":
      return object.spinner.finished;
  }
};

function judgeHittable(
  hittable: Hittable,
  result: HitResult,
  frameTime: number,
  state: ScoreState,
): void {
  hittable.result = result;
  hittable.resultTime = frameTime;
  applyAccuracyResult(state, result);
}

// Mirrors lazer's StartTimeOrderedHitPolicy: a hit is blocked while the latest
// circle/head that starts before the target is unjudged and its start time has
// not been reached yet.
function isNoteLocked(hittables: Hittable[], targetIndex: number, frameTime: number): boolean {
  const target = hittables[targetIndex];
  for (let i = targetIndex - 1; i >= 0; i--) {
    const blocking = hittables[i];
    if (blocking.time >= target.time) continue;
    return blocking.result === null && frameTime < blocking.time;
  }
  return false;
}

// Lazer routes a press to the earliest alive, unjudged circle under the cursor
// (earlier objects are drawn on top). That circle consumes the press even when
// the hit is refused, which shakes the circle instead.
function handlePress(
  hittables: Hittable[],
  firstUnjudged: number,
  frameTime: number,
  x: number,
  y: number,
  radius: number,
  windows: HitWindows,
  state: ScoreState,
): void {
  for (let i = firstUnjudged; i < hittables.length; i++) {
    const target = hittables[i];
    if (frameTime < target.time - target.preempt) return;
    if (target.result !== null) continue;
    if (!isInside(x, y, target.x, target.y, radius)) continue;

    const timeOffset = frameTime - target.time;
    if (Math.abs(timeOffset) > windows.miss) return;
    if (isNoteLocked(hittables, i, frameTime)) return;

    // lazer scores the earlier circles' misses before the hit itself, so the hit
    // starts the new combo.
    for (let j = firstUnjudged; j < i; j++) {
      const earlier = hittables[j];
      if (earlier.result === null && earlier.time < target.time) {
        judgeHittable(earlier, HitResult.Miss, frameTime, state);
      }
    }

    judgeHittable(target, resultForOffset(Math.abs(timeOffset), windows), frameTime, state);
    target.click = { x, y };
    return;
  }
}

// Lazer misses a circle once the Meh window has passed (HitWindows.CanBeHit).
function updateHittable(
  hittable: Hittable,
  frameTime: number,
  windows: HitWindows,
  state: ScoreState,
): void {
  if (hittable.result === null && frameTime - hittable.time > windows.meh) {
    judgeHittable(hittable, HitResult.Miss, frameTime, state);
  }
}

function updateSlider(
  slider: SliderState,
  frameTime: number,
  holding: boolean,
  x: number,
  y: number,
  radius: number,
  state: ScoreState,
): number | undefined {
  const hitObject = slider.hitObject;
  if (slider.finished || frameTime < hitObject.startTime) return undefined;

  // Tracking: while holding a button and within the follow area around the
  // current slider-ball position. Independent of the head result (a slider can be
  // picked up mid-way even after a missed head). As in lazer's SliderInputManager,
  // tracking starts within the ball itself and only then extends to the full
  // follow area, except that hitting the head starts it anywhere in the follow area.
  const ball = getSliderBallPosition(hitObject, Math.min(frameTime, hitObject.endTime));
  const headHitNow = slider.head.resultTime === frameTime && slider.head.result !== HitResult.Miss;
  const followRadius =
    slider.tracking || headHitNow ? radius * SLIDER_TRACKING_RADIUS_MULTIPLIER : radius;
  const tracking =
    holding && ball !== null && isInside(x, y, ball.position.x, ball.position.y, followRadius);
  slider.tracking = tracking;

  const judgeEvent = (event: SliderEvent): void => {
    applySliderEvent(state, event, tracking);
    if (event.isTail) {
      slider.tailResult = tracking ? HitResult.Great : HitResult.Miss;
      slider.tailResultTime = frameTime;
    }
  };

  // Judge any tick/repeat/tail whose time has been reached this frame. Once the
  // slider has ended, judge the rest too (e.g. sparse replay frames near the end).
  const ended = frameTime >= hitObject.endTime;
  const eventCap = ended ? Infinity : frameTime;
  while (
    slider.nextEventIndex < slider.events.length &&
    slider.events[slider.nextEventIndex].time <= eventCap
  ) {
    const event = slider.events[slider.nextEventIndex];
    // The tail can be hit at any point in its leniency window, and is only
    // missed once the slider ends (lazer's SliderInputManager.TryJudgeNestedObject).
    if (event.isTail && !tracking && !ended) break;
    judgeEvent(event);
    slider.nextEventIndex++;
  }

  if (ended) {
    if (slider.tailResult === null) {
      slider.tailResult = HitResult.Miss;
      slider.tailResultTime = frameTime;
    }
    slider.finished = true;
  }

  return tracking ? ball?.progress : undefined;
}

function updateSpinner(
  spinner: SpinnerState,
  frameTime: number,
  currentAngle: number,
  holding: boolean,
  od: number,
  clockRate: number,
  state: ScoreState,
): void {
  const hitObject = spinner.hitObject;
  if (spinner.finished || frameTime < hitObject.startTime) return;

  // lazer only adds rotation while the spinner is spinnable (before its end time),
  // scaled by the gameplay rate (SpinnerRotationTracker.AddRotation).
  if (spinner.lastAngle !== null && holding && frameTime < hitObject.endTime) {
    const delta = getAngularDifference(spinner.lastAngle, currentAngle);
    addSpinnerRotation(spinner, delta * clockRate);
  }
  spinner.lastAngle = currentAngle;

  if (frameTime >= hitObject.endTime) finishSpinner(spinner, hitObject.endTime, od, state);
}

// Turning back within a spin doesn't count, and a spin completes once the
// rotation since the last completed spin reaches a full turn either way.
function addSpinnerRotation(spinner: SpinnerState, delta: number): void {
  const fullSpin = 2 * Math.PI;
  spinner.currentSpinRotation += delta;
  spinner.currentSpinMaxRotation = Math.max(
    spinner.currentSpinMaxRotation,
    Math.abs(spinner.currentSpinRotation),
  );
  while (spinner.currentSpinMaxRotation >= fullSpin) {
    spinner.completedSpins++;
    spinner.currentSpinRotation -= Math.sign(spinner.currentSpinRotation) * fullSpin;
    spinner.currentSpinMaxRotation = Math.abs(spinner.currentSpinRotation);
  }
  spinner.totalRotation = spinner.completedSpins * fullSpin + spinner.currentSpinMaxRotation;
}

function finishSpinner(spinner: SpinnerState, time: number, od: number, state: ScoreState): void {
  const duration = spinner.hitObject.endTime - spinner.hitObject.startTime;
  const spinsRequired = calcSpinsRequired(duration, od);
  const completedSpins = spinner.totalRotation / (2 * Math.PI);

  let spinnerResult: HitResult;
  if (spinsRequired === 0) {
    spinnerResult = HitResult.Great;
  } else {
    const progress = Math.min(1, completedSpins / spinsRequired);
    if (progress >= 1) spinnerResult = HitResult.Great;
    else if (progress > 0.9) spinnerResult = HitResult.Ok;
    else if (progress > 0.75) spinnerResult = HitResult.Meh;
    else spinnerResult = HitResult.Miss;
  }

  applyAccuracyResult(state, spinnerResult);

  const maxBonusSpins = calcMaxBonusSpins(duration, od, spinsRequired);
  const spinsRequiredForBonus = spinsRequired + BONUS_SPINS_GAP;
  const spinCount = Math.floor(completedSpins);
  const smallBonusCount = Math.min(spinCount, spinsRequiredForBonus);
  const largeBonusCount = Math.min(Math.max(0, spinCount - spinsRequiredForBonus), maxBonusSpins);
  state.bonusPortion += smallBonusCount * SCORE_SMALL_BONUS + largeBonusCount * SCORE_LARGE_BONUS;

  spinner.result = spinnerResult;
  spinner.resultTime = time;
  spinner.finished = true;
}

function createObjectStates(
  beatmap: StandardBeatmap,
  sliderEventsCache: Map<number, SliderEvent[]>,
): ObjectState[] {
  return beatmap.hitObjects.map((hitObject, index): ObjectState => {
    if (isSpinner(hitObject)) {
      return {
        kind: "spinner",
        hitObject: hitObject as StandardSpinner,
        spinner: {
          hitObject: hitObject as StandardSpinner,
          totalRotation: 0,
          completedSpins: 0,
          currentSpinRotation: 0,
          currentSpinMaxRotation: 0,
          lastAngle: null,
          result: null,
          resultTime: null,
          finished: false,
        },
      };
    }

    const position = hitObject.stackedStartPosition;
    const head: Hittable = {
      x: position.x,
      y: position.y,
      time: hitObject.startTime,
      preempt: hitObject.timePreempt,
      result: null,
      resultTime: null,
      click: null,
    };

    if (!isSlider(hitObject)) return { kind: "circle", hitObject, head };

    const slider = hitObject as Slider;
    return {
      kind: "slider",
      hitObject: slider,
      head,
      slider: {
        hitObject: slider,
        events: sliderEventsCache.get(index)!,
        nextEventIndex: 0,
        head,
        tracking: false,
        tailResult: null,
        tailResultTime: null,
        finished: false,
      },
    };
  });
}

// An object closer than this to the previous one gives no direction to measure along.
const MIN_DIRECTION_LENGTH = 1;

function clickStats(head: Hittable, previous: ObjectState | undefined): ClickStats | undefined {
  if (!head.click || head.resultTime === null) return undefined;
  const { x, y } = head.click;
  const stats: ClickStats = {
    x,
    y,
    timing: head.resultTime - head.time,
    distance: Math.hypot(x - head.x, y - head.y),
  };
  if (!previous || previous.kind === "spinner") return stats;

  const from = previous.hitObject.stackedEndPosition;
  const dirX = head.x - from.x;
  const dirY = head.y - from.y;
  const length = Math.hypot(dirX, dirY);
  if (length < MIN_DIRECTION_LENGTH) return stats;

  const toClickX = x - from.x;
  const toClickY = y - from.y;
  const along = (toClickX * dirX + toClickY * dirY) / length;
  const across = (dirX * toClickY - dirY * toClickX) / length;
  stats.overshoot = along - length;
  stats.angle = (Math.atan2(across, along) * 180) / Math.PI;
  return stats;
}

function toResultHitObject(object: ObjectState, previous: ObjectState | undefined): HitObject {
  switch (object.kind) {
    case "circle":
      return {
        x: object.head.x,
        y: object.head.y,
        time: object.head.time,
        resultTime: object.head.resultTime ?? object.head.time,
        result: object.head.result ?? HitResult.Miss,
        click: clickStats(object.head, previous),
        type: object.hitObject.hitType,
      };
    case "slider":
      return {
        x: object.head.x,
        y: object.head.y,
        time: object.head.time,
        resultTime: object.head.resultTime ?? object.head.time,
        endTime: object.hitObject.endTime,
        result: object.head.result ?? HitResult.Miss,
        endResult: object.slider.tailResult ?? HitResult.Miss,
        endResultTime: object.slider.tailResultTime ?? object.hitObject.endTime,
        click: clickStats(object.head, previous),
        type: object.hitObject.hitType,
      };
    case "spinner": {
      const spinner = object.hitObject;
      return {
        x: PLAYFIELD.centerX,
        y: PLAYFIELD.centerY,
        time: spinner.startTime,
        resultTime: object.spinner.resultTime ?? spinner.endTime,
        endTime: spinner.endTime,
        totalRotation: object.spinner.totalRotation,
        result: object.spinner.result ?? HitResult.Miss,
        type: spinner.hitType,
      };
    }
  }
}

const LEFT_BIT = 1 << StandardAction.LeftButton;
const RIGHT_BIT = 1 << StandardAction.RightButton;
const STANDARD_ACTIONS = [
  StandardAction.LeftButton,
  StandardAction.RightButton,
  StandardAction.Smoke,
];

function toReplayFrames(replay: Replay): ReplayFrames {
  const frames = replay.frames as StandardReplayFrame[];
  const length = frames.length;
  const result: ReplayFrames = {
    length,
    time: new Float64Array(length),
    x: new Float64Array(length),
    y: new Float64Array(length),
    actions: new Uint8Array(length),
  };
  for (let i = 0; i < length; i++) {
    result.time[i] = frames[i].startTime;
    result.x[i] = frames[i].position.x;
    result.y[i] = frames[i].position.y;
    for (const action of frames[i].actions) result.actions[i] |= 1 << action;
  }
  return result;
}

const actionsFrom = (bits: number): StandardAction[] =>
  STANDARD_ACTIONS.filter((action) => bits & (1 << action));

// =============================================================================
// Main Simulation
// =============================================================================

/**
 * Judges a replay as lazer would. `beatmap` is the decoded .osu, and `mods` are the
 * score's lazer mods with their settings (from the osu! API).
 */
export const simulateScore = (
  replay: Replay | ReplayFrames,
  decodedBeatmap: Beatmap,
  mods: LazerMod[] = [],
): Simulation => {
  const scoreMultiplier = scoreMultiplierFor(mods, decodedBeatmap.difficulty.clone());
  const clockRate = clockRateFor(mods);
  const beatmap = applyMods(decodedBeatmap, mods);
  const frames = "frames" in replay ? toReplayFrames(replay) : replay;
  const radius = calcObjectRadius(beatmap.difficulty.circleSize);
  const od = beatmap.difficulty.overallDifficulty;
  const windows = calcHitWindows(od);

  const sliderEventsCache = new Map<number, SliderEvent[]>();
  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const hitObject = beatmap.hitObjects[i];
    if (isSlider(hitObject)) {
      const sliderData = extractSliderData(hitObject as Slider);
      sliderEventsCache.set(i, buildSliderEvents(sliderData, (hitObject as Slider).endTime));
    }
  }

  const scoringTotals = calculateMaxScoringTotals(beatmap, sliderEventsCache);
  const state = createScoreState();

  const objects = createObjectStates(beatmap, sliderEventsCache);
  const hittables = objects.flatMap((object) => (object.kind === "spinner" ? [] : [object.head]));

  // Every object before these indices is fully judged; they bound the per-frame scans.
  let firstUnfinished = 0;
  let firstUnjudged = 0;

  // The first and last replay frames aren't simulated.
  const out = createSimulatedFrames(Math.max(0, frames.length - 2));
  for (let i = 1; i < frames.length - 1; i++) {
    const frameTime = frames.time[i];
    const left = (frames.actions[i] & LEFT_BIT) !== 0;
    const prevLeft = (frames.actions[i - 1] & LEFT_BIT) !== 0;
    const right = (frames.actions[i] & RIGHT_BIT) !== 0;
    const prevRight = (frames.actions[i - 1] & RIGHT_BIT) !== 0;
    const holding = left || right;
    const x = frames.x[i];
    const y = frames.y[i];

    // Each newly pressed key is a separate press, as in lazer.
    const pressCount = Number(!prevLeft && left) + Number(!prevRight && right);
    for (let press = 0; press < pressCount; press++) {
      handlePress(hittables, firstUnjudged, frameTime, x, y, radius, windows, state);
    }

    let activeSliderProgress: number | undefined;
    let currentSpinnerRotation: number | undefined;

    for (let j = firstUnfinished; j < objects.length; j++) {
      const object = objects[j];
      if (frameTime < object.hitObject.startTime - object.hitObject.timePreempt) break;

      if (object.kind === "spinner") {
        updateSpinner(
          object.spinner,
          frameTime,
          getCursorAngle(x, y),
          holding,
          od,
          clockRate,
          state,
        );
        if (!object.spinner.finished && frameTime >= object.hitObject.startTime) {
          currentSpinnerRotation ??= object.spinner.totalRotation;
        }
        continue;
      }

      updateHittable(object.head, frameTime, windows, state);
      if (object.kind === "slider") {
        const progress = updateSlider(object.slider, frameTime, holding, x, y, radius, state);
        activeSliderProgress ??= progress;
      }
    }

    while (firstUnfinished < objects.length && isObjectFinished(objects[firstUnfinished])) {
      firstUnfinished++;
    }
    while (firstUnjudged < hittables.length && hittables[firstUnjudged].result !== null) {
      firstUnjudged++;
    }

    const { accuracy, score } = calculateLazerScore(state, scoringTotals, scoreMultiplier);

    const k = i - 1;
    out.x[k] = x;
    out.y[k] = y;
    out.time[k] = frameTime;
    out.score[k] = score;
    out.combo[k] = state.combo;
    out.great[k] = state.great;
    out.good[k] = state.good;
    out.okay[k] = state.okay;
    out.miss[k] = state.miss;
    out.accuracy[k] = accuracy;
    out.actions[k] = frames.actions[i];
    out.currentSpinnerRotation[k] = currentSpinnerRotation ?? NaN;
    out.activeSliderProgress[k] = activeSliderProgress ?? NaN;
  }

  return {
    hitObjects: objects.map((object, i) => toResultHitObject(object, objects[i - 1])),
    frames: out,
  };
};
