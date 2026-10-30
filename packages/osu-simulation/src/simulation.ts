import { HitResult, type Beatmap, type HitType, type Replay } from "osu-classes";
import {
  StandardAction,
  StandardBeatmap,
  type StandardReplayFrame,
  Slider,
  SliderRepeat,
  SliderTick,
  Spinner as StandardSpinner,
} from "osu-standard-stable";
import { calcObjectRadius, PLAYFIELD } from "./math";
import { applyMods, clockRateFor, scoreMultiplierFor, type LazerMod } from "./mods";

// Bump whenever simulateScore's output changes for the same replay, so stored
// simulations are recomputed.
export const SIMULATION_VERSION = 3;

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
  slider?: SliderData;
  // Sliders are judged as two separate components: the head (`result`/`resultTime`,
  // judged on click) and the tail (`endResult`/`endResultTime`, judged on whether the
  // player was tracking at the slider's end).
  endResult?: HitResult;
  endResultTime?: number;
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
  angle?: number;
  currentSpinnerRotation?: number;
  activeSliderProgress?: number;
};

export type Simulation = {
  hitObjects: HitObject[];
  frames: SimulatedFrame[];
};

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
// The follow circle allows tracking within 2.4x the object radius; the tail can
// be hit from 36ms before the slider's end time (SliderEventGenerator.TAIL_LENIENCY).
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
// is a "large tick" (30), and the slider ends with a tail (150) at its end time.
// Each is judged by whether the player is tracking when its time is reached.
type SliderEvent = { time: number; base: number; isTail: boolean };

const buildSliderEvents = (sliderData: SliderData, endTime: number): SliderEvent[] => {
  const events: SliderEvent[] = [...sliderData.tickPositions, ...sliderData.repeatPositions]
    .map(({ time }) => ({ time, base: SCORE_LARGE_TICK, isTail: false }))
    .sort((a, b) => a.time - b.time);
  events.push({ time: endTime, base: SCORE_TAIL, isTail: true });
  return events;
};

const extractSliderData = (slider: Slider): SliderData => {
  const origin = slider.stackedStartPosition;
  const path: Coordinate[] = slider.path.path.map((p) => ({
    x: p.x + origin.x,
    y: p.y + origin.y,
  }));

  // The ticks and repeats come from osu-standard-stable's nested objects, which
  // are generated as lazer's SliderEventGenerator does: no tick within 10ms of a
  // span's end, and the ticks of reverse spans mirrored.
  const stackOffsetX = origin.x - slider.startPosition.x;
  const stackOffsetY = origin.y - slider.startPosition.y;
  const tickPositions: { position: Coordinate; time: number }[] = [];
  const repeatPositions: { position: Coordinate; time: number }[] = [];
  for (const nested of slider.nestedHitObjects) {
    const target =
      nested instanceof SliderTick
        ? tickPositions
        : nested instanceof SliderRepeat
          ? repeatPositions
          : null;
    target?.push({
      position: {
        x: nested.startPosition.x + stackOffsetX,
        y: nested.startPosition.y + stackOffsetY,
      },
      time: nested.startTime,
    });
  }

  return {
    path,
    repeats: slider.repeats,
    duration: slider.duration,
    velocity: slider.velocity,
    tickPositions,
    repeatPositions,
    endPosition: path[path.length - 1],
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
  /** The key of the first press that reached this object, as lazer's HitReceptor.HitAction. */
  hitAction: StandardAction | null;
  /** The slider this is the head of. */
  slider?: SliderState;
};

type SliderState = {
  hitObject: Slider;
  sliderData: SliderData;
  events: SliderEvent[];
  nextEventIndex: number;
  head: Hittable;
  tracking: boolean;
  /** From the head hit until this time, only the head's key can track (lazer's timeToAcceptAnyKeyAfter). */
  acceptAnyKeyAfter: number | null;
  lastLeft: boolean;
  lastRight: boolean;
  tailResult: HitResult | null;
  tailResultTime: number | null;
  finished: boolean;
};

type FrameInput = { x: number; y: number; left: boolean; right: boolean };

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
  action: StandardAction,
  input: FrameInput,
  radius: number,
  windows: HitWindows,
  state: ScoreState,
): void {
  for (let i = firstUnjudged; i < hittables.length; i++) {
    const target = hittables[i];
    if (frameTime < target.time - target.preempt) return;
    if (target.result !== null) continue;
    if (!isInside(input.x, input.y, target.x, target.y, radius)) continue;

    target.hitAction ??= action;

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

    const result = resultForOffset(Math.abs(timeOffset), windows);
    judgeHittable(target, result, frameTime, state);
    if (target.slider && result !== HitResult.Miss) {
      postProcessHeadHit(target.slider, frameTime, input, radius, state);
    }
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

// Where lazer's follow circle is: on the slider's path at the given time,
// clamped to the head before the slider starts and to the end after it ends.
const followPosition = (slider: Slider, time: number): Coordinate =>
  getSliderBallPosition(slider, Math.min(slider.endTime, Math.max(slider.startTime, time)))!
    .position;

function isInFollowArea(
  slider: Slider,
  time: number,
  point: Coordinate,
  radius: number,
  expanded: boolean,
): boolean {
  const followRadius = expanded ? radius * SLIDER_TRACKING_RADIUS_MULTIPLIER : radius;
  const position = followPosition(slider, time);
  return (point.x - position.x) ** 2 + (point.y - position.y) ** 2 <= followRadius ** 2;
}

// lazer's SliderInputManager.updateTracking. Once the head is hit, only its key
// tracks until the other key has been released, so a key held from before the
// slider can't carry it.
function updateTracking(
  slider: SliderState,
  frameTime: number,
  input: FrameInput,
  validPosition: boolean,
): void {
  const hitAction = slider.head.hitAction;
  if (hitAction === null) {
    slider.acceptAnyKeyAfter = null;
  } else if (slider.acceptAnyKeyAfter === null) {
    const otherKeyHeld =
      hitAction === StandardAction.LeftButton ? slider.lastRight : slider.lastLeft;
    if (!otherKeyHeld) slider.acceptAnyKeyAfter = frameTime;
  }

  const onlyHitAction =
    hitAction !== null &&
    (slider.acceptAnyKeyAfter === null || frameTime <= slider.acceptAnyKeyAfter);
  const validAction = onlyHitAction
    ? hitAction === StandardAction.LeftButton
      ? input.left
      : input.right
    : input.left || input.right;

  slider.lastLeft = input.left;
  slider.lastRight = input.right;
  slider.tracking = validPosition && validAction;
}

function judgeSliderEvent(
  slider: SliderState,
  event: SliderEvent,
  hit: boolean,
  frameTime: number,
  state: ScoreState,
): void {
  applySliderEvent(state, event, hit);
  if (event.isTail) {
    slider.tailResult = hit ? HitResult.Great : HitResult.Miss;
    slider.tailResultTime = frameTime;
  }
  slider.nextEventIndex++;
}

// lazer's SliderInputManager.PostProcessHeadJudgement. When the head is hit late
// with the cursor in the expanded follow area, the ticks and repeats already
// passed are hit if they were all within that area of the cursor, and missed
// otherwise.
function postProcessHeadHit(
  slider: SliderState,
  frameTime: number,
  input: FrameInput,
  radius: number,
  state: ScoreState,
): void {
  const hitObject = slider.hitObject;
  if (!isInFollowArea(hitObject, frameTime, input, radius, true)) return;

  const passed = slider.events.slice(slider.nextEventIndex).filter((e) => e.time <= frameTime);
  const allInRange = passed.every((event) =>
    isInFollowArea(hitObject, event.time, input, radius, true),
  );
  for (const event of passed) judgeSliderEvent(slider, event, allInRange, frameTime, state);

  updateTracking(
    slider,
    frameTime,
    input,
    allInRange || isInFollowArea(hitObject, frameTime, input, radius, false),
  );
}

function updateSlider(
  slider: SliderState,
  frameTime: number,
  input: FrameInput,
  radius: number,
  state: ScoreState,
): number | undefined {
  const hitObject = slider.hitObject;
  if (slider.finished) return undefined;

  // As in lazer, tracking is updated from when the slider appears, and starts
  // within the ball itself before extending to the full follow area.
  updateTracking(
    slider,
    frameTime,
    input,
    isInFollowArea(hitObject, frameTime, input, radius, slider.tracking),
  );

  // lazer's SliderInputManager.TryJudgeNestedObject: nothing is judged until the
  // head is, and the tail can be hit from TAIL_LENIENCY_MS before the end but is
  // only missed at the end.
  while (slider.head.result !== null && slider.nextEventIndex < slider.events.length) {
    const event = slider.events[slider.nextEventIndex];
    const judgeFrom = event.isTail && slider.tracking ? event.time - TAIL_LENIENCY_MS : event.time;
    if (frameTime < judgeFrom) break;
    judgeSliderEvent(slider, event, slider.tracking, frameTime, state);
  }
  slider.finished = slider.nextEventIndex === slider.events.length;

  if (!slider.tracking || frameTime < hitObject.startTime || frameTime > hitObject.endTime) {
    return undefined;
  }
  return getSliderBallPosition(hitObject, frameTime)?.progress;
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
  sliderDataCache: Map<number, SliderData>,
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
      hitAction: null,
    };

    if (!isSlider(hitObject)) return { kind: "circle", hitObject, head };

    const slider = hitObject as Slider;
    head.slider = {
      hitObject: slider,
      sliderData: sliderDataCache.get(index)!,
      events: sliderEventsCache.get(index)!,
      nextEventIndex: 0,
      head,
      tracking: false,
      acceptAnyKeyAfter: null,
      lastLeft: false,
      lastRight: false,
      tailResult: null,
      tailResultTime: null,
      finished: false,
    };
    return { kind: "slider", hitObject: slider, head, slider: head.slider };
  });
}

function toResultHitObject(object: ObjectState): HitObject {
  switch (object.kind) {
    case "circle":
      return {
        x: object.head.x,
        y: object.head.y,
        time: object.head.time,
        resultTime: object.head.resultTime ?? object.head.time,
        result: object.head.result ?? HitResult.Miss,
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
        type: object.hitObject.hitType,
        slider: object.slider.sliderData,
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

// =============================================================================
// Main Simulation
// =============================================================================

/**
 * Judges a replay as lazer would. `beatmap` is the decoded .osu, and `mods` are the
 * score's lazer mods with their settings (from the osu! API).
 */
export const simulateScore = (
  replay: Replay,
  decodedBeatmap: Beatmap,
  mods: LazerMod[] = [],
): Simulation => {
  const scoreMultiplier = scoreMultiplierFor(mods, decodedBeatmap.difficulty.clone());
  const clockRate = clockRateFor(mods);
  const beatmap = applyMods(decodedBeatmap, mods);
  const simulatedFrames: SimulatedFrame[] = [];
  const frames = replay.frames as StandardReplayFrame[];
  const radius = calcObjectRadius(beatmap.difficulty.circleSize);
  const od = beatmap.difficulty.overallDifficulty;
  const windows = calcHitWindows(od);

  const sliderDataCache = new Map<number, SliderData>();
  const sliderEventsCache = new Map<number, SliderEvent[]>();
  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const hitObject = beatmap.hitObjects[i];
    if (isSlider(hitObject)) {
      const sliderData = extractSliderData(hitObject as Slider);
      sliderDataCache.set(i, sliderData);
      sliderEventsCache.set(i, buildSliderEvents(sliderData, (hitObject as Slider).endTime));
    }
  }

  const scoringTotals = calculateMaxScoringTotals(beatmap, sliderEventsCache);
  const state = createScoreState();

  const objects = createObjectStates(beatmap, sliderDataCache, sliderEventsCache);
  const hittables = objects.flatMap((object) => (object.kind === "spinner" ? [] : [object.head]));

  // Every object before these indices is fully judged; they bound the per-frame scans.
  let firstUnfinished = 0;
  let firstUnjudged = 0;

  for (let i = 1; i < replay.frames.length - 1; i++) {
    const frame = frames[i];
    const prevFrame = frames[i - 1];
    const frameTime = frame.startTime;
    const left = frame.actions.has(StandardAction.LeftButton);
    const prevLeft = prevFrame.actions.has(StandardAction.LeftButton);
    const right = frame.actions.has(StandardAction.RightButton);
    const prevRight = prevFrame.actions.has(StandardAction.RightButton);
    const holding = left || right;
    const { x, y } = frame.position;
    const input: FrameInput = { x, y, left, right };
    const currentAngle = getCursorAngle(x, y);

    // Each newly pressed key is a separate press, as in lazer.
    if (!prevLeft && left) {
      handlePress(
        hittables,
        firstUnjudged,
        frameTime,
        StandardAction.LeftButton,
        input,
        radius,
        windows,
        state,
      );
    }
    if (!prevRight && right) {
      handlePress(
        hittables,
        firstUnjudged,
        frameTime,
        StandardAction.RightButton,
        input,
        radius,
        windows,
        state,
      );
    }

    let activeSliderProgress: number | undefined;
    let currentSpinnerRotation: number | undefined;

    for (let j = firstUnfinished; j < objects.length; j++) {
      const object = objects[j];
      if (frameTime < object.hitObject.startTime - object.hitObject.timePreempt) break;

      if (object.kind === "spinner") {
        updateSpinner(object.spinner, frameTime, currentAngle, holding, od, clockRate, state);
        if (!object.spinner.finished && frameTime >= object.hitObject.startTime) {
          currentSpinnerRotation ??= object.spinner.totalRotation;
        }
        continue;
      }

      // lazer updates a slider's ticks and tail before its head, so a head that
      // misses this frame lets them be judged from the next one.
      if (object.kind === "slider") {
        const progress = updateSlider(object.slider, frameTime, input, radius, state);
        activeSliderProgress ??= progress;
      }
      updateHittable(object.head, frameTime, windows, state);
    }

    while (firstUnfinished < objects.length && isObjectFinished(objects[firstUnfinished])) {
      firstUnfinished++;
    }
    while (firstUnjudged < hittables.length && hittables[firstUnjudged].result !== null) {
      firstUnjudged++;
    }

    const { accuracy, score } = calculateLazerScore(state, scoringTotals, scoreMultiplier);

    simulatedFrames.push({
      x,
      y,
      time: frameTime,
      score,
      combo: state.combo,
      great: state.great,
      good: state.good,
      okay: state.okay,
      miss: state.miss,
      accuracy,
      actions: Array.from(frame.actions),
      angle: currentAngle,
      currentSpinnerRotation,
      activeSliderProgress,
    });
  }

  return {
    hitObjects: objects.map(toResultHitObject),
    frames: simulatedFrames,
  };
};
