import { HitResult, type HitType, type Replay } from "osu-classes";
import {
  StandardAction,
  StandardBeatmap,
  type StandardReplayFrame,
  Slider,
  Spinner as StandardSpinner,
} from "osu-standard-stable";
import { calcObjectRadius, PLAYFIELD } from "./math";

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
  actions: Set<StandardAction>;
  angle?: number;
  currentSpinnerRotation?: number;
  activeSliderProgress?: number;
};

export type Simulation = {
  hitObjects: HitObject[];
  frames: SimulatedFrame[];
};

export const isInside = (
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  hr: number,
) => Math.sqrt((cx - hx) ** 2 + (cy - hy) ** 2) < hr;

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

const isCircle = (hitObject: StandardHitObject): boolean =>
  !isSlider(hitObject) && !isSpinner(hitObject);

// osu!lazer ScoreProcessor constants.
const COMBO_EXPONENT = 0.5;
const SCORE_GREAT = 300;
const SCORE_OK = 100;
const SCORE_MEH = 50;
const SCORE_LARGE_TICK = 30;
const SCORE_TAIL = 150;
const SCORE_SMALL_BONUS = 10;
const SCORE_LARGE_BONUS = 50;

const CLEAR_RPM_OD0 = 90;
const CLEAR_RPM_OD5 = 150;
const CLEAR_RPM_OD10 = 225;
const COMPLETE_RPM_OD0 = 250;
const COMPLETE_RPM_OD5 = 380;
const COMPLETE_RPM_OD10 = 430;
const BONUS_SPINS_GAP = 2;

function difficultyRange(
  difficulty: number,
  min: number,
  mid: number,
  max: number,
): number {
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
function calcMaxBonusSpins(
  durationMs: number,
  od: number,
  spinsRequired: number,
): number {
  const rpm = difficultyRange(
    od,
    COMPLETE_RPM_OD0,
    COMPLETE_RPM_OD5,
    COMPLETE_RPM_OD10,
  );
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

const sliderBodyScore = (sliderData: SliderData): number =>
  (sliderData.tickPositions.length + sliderData.repeatPositions.length) *
    SCORE_LARGE_TICK +
  SCORE_TAIL;

const extractSliderData = (slider: Slider): SliderData => {
  const path: Coordinate[] = slider.path.path.map((p) => ({
    x: p.x + slider.startX,
    y: p.y + slider.startY,
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
            x: position.x + slider.startX,
            y: position.y + slider.startY,
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

  const localPosition = slider.path.positionAt(
    Math.min(1, Math.max(0, pathProgress)),
  );
  return {
    position: {
      x: localPosition.x + slider.startX,
      y: localPosition.y + slider.startY,
    },
    progress: progressInSpan,
  };
};

type ScoreState = {
  hitObjectIndex: number;
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
  hitObjects: HitObject[];
};

function createScoreState(): ScoreState {
  return {
    hitObjectIndex: 0,
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
    hitObjects: [],
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

function applySliderBodyCompletion(
  state: ScoreState,
  sliderData: SliderData,
  comboAtHead: number,
): void {
  state.currentComboPortion += comboScore(
    comboAtHead,
    sliderBodyScore(sliderData),
  );
}

type ScoringTotals = {
  maxComboPortion: number;
  totalAccuracyCount: number;
};

function calculateMaxScoringTotals(
  beatmap: StandardBeatmap,
  sliderDataCache: Map<number, SliderData>,
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
      const sliderData = sliderDataCache.get(i)!;
      maxComboPortion += comboScore(combo, sliderBodyScore(sliderData));
    }
  }

  return { maxComboPortion, totalAccuracyCount };
}

function calculateLazerScore(
  state: ScoreState,
  scoringTotals: ScoringTotals,
): { accuracy: number; score: number } {
  const accuracy =
    state.currentMaxBaseScore > 0
      ? state.currentBaseScore / state.currentMaxBaseScore
      : 1;
  const comboProgress =
    scoringTotals.maxComboPortion > 0
      ? state.currentComboPortion / scoringTotals.maxComboPortion
      : 0;
  const accuracyProgress =
    scoringTotals.totalAccuracyCount > 0
      ? state.judgedAccuracyCount / scoringTotals.totalAccuracyCount
      : 0;

  return {
    accuracy,
    score: Math.round(
      500000 * accuracy * comboProgress +
        500000 * Math.pow(accuracy, 5) * accuracyProgress +
        state.bonusPortion,
    ),
  };
}

type ActiveSlider = {
  hitObject: Slider;
  sliderData: SliderData;
  headResult: HitResult | null;
  comboAtHead: number;
};

function processActiveSlider(
  activeSlider: ActiveSlider,
  frameTime: number,
  clicked: boolean,
  x: number,
  y: number,
  radius: number,
  windows: HitWindows,
  state: ScoreState,
): { activeSlider: ActiveSlider | null; progress: number | undefined } {
  const slider = activeSlider.hitObject;

  if (activeSlider.headResult === null) {
    const timeOffset = frameTime - slider.startTime;

    if (timeOffset > windows.miss) {
      applyAccuracyResult(state, HitResult.Miss);
      activeSlider.headResult = HitResult.Miss;
      activeSlider.comboAtHead = state.combo;
    } else if (
      clicked &&
      isInside(x, y, slider.startX, slider.startY, radius)
    ) {
      const result = resultForOffset(Math.abs(timeOffset), windows);
      applyAccuracyResult(state, result);
      activeSlider.headResult = result;
      activeSlider.comboAtHead = state.combo;
    }
  }

  const sliderBallPos = getSliderBallPosition(slider, frameTime);
  const progress = sliderBallPos?.progress;

  if (frameTime >= slider.endTime) {
    if (activeSlider.headResult === null) {
      applyAccuracyResult(state, HitResult.Miss);
      activeSlider.headResult = HitResult.Miss;
      activeSlider.comboAtHead = state.combo;
    }

    const sd = activeSlider.sliderData;
    applySliderBodyCompletion(state, sd, activeSlider.comboAtHead);

    state.hitObjects.push({
      x: slider.startX,
      y: slider.startY,
      time: slider.startTime,
      resultTime: slider.endTime,
      endTime: slider.endTime,
      result: activeSlider.headResult,
      type: slider.hitType,
      slider: sd,
    });

    state.hitObjectIndex++;
    return { activeSlider: null, progress };
  }

  return { activeSlider, progress };
}

type ActiveSpinner = {
  hitObject: StandardSpinner;
  totalRotation: number;
  lastAngle: number;
};

function processActiveSpinner(
  activeSpinner: ActiveSpinner,
  frameTime: number,
  currentAngle: number,
  isHolding: boolean,
  od: number,
  state: ScoreState,
): ActiveSpinner | null {
  const angleDiff = getAngularDifference(activeSpinner.lastAngle, currentAngle);
  if (isHolding) {
    activeSpinner.totalRotation += Math.abs(angleDiff);
  }
  activeSpinner.lastAngle = currentAngle;

  if (frameTime >= activeSpinner.hitObject.endTime) {
    const duration =
      activeSpinner.hitObject.endTime - activeSpinner.hitObject.startTime;
    const spinsRequired = calcSpinsRequired(duration, od);
    const completedSpins = activeSpinner.totalRotation / (2 * Math.PI);

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
    const largeBonusCount = Math.min(
      Math.max(0, spinCount - spinsRequiredForBonus),
      maxBonusSpins,
    );
    state.bonusPortion +=
      smallBonusCount * SCORE_SMALL_BONUS + largeBonusCount * SCORE_LARGE_BONUS;

    state.hitObjects.push({
      x: PLAYFIELD.centerX,
      y: PLAYFIELD.centerY,
      time: activeSpinner.hitObject.startTime,
      resultTime: frameTime,
      endTime: activeSpinner.hitObject.endTime,
      totalRotation: activeSpinner.totalRotation,
      result: spinnerResult,
      type: activeSpinner.hitObject.hitType,
    });

    state.hitObjectIndex++;
    return null;
  }

  return activeSpinner;
}

function registerCircleHit(
  hitObject: StandardHitObject,
  frameTime: number,
  result: HitResult,
  state: ScoreState,
): void {
  applyAccuracyResult(state, result);
  state.hitObjectIndex++;
  state.hitObjects.push({
    x: hitObject.startX,
    y: hitObject.startY,
    time: hitObject.startTime,
    resultTime: frameTime,
    result,
    type: hitObject.hitType,
  });
}

// =============================================================================
// Main Simulation
// =============================================================================

export const simulateScore = (
  replay: Replay,
  beatmap: StandardBeatmap,
): Simulation => {
  const simulatedFrames: SimulatedFrame[] = [];
  const frames = replay.frames as StandardReplayFrame[];
  const radius = calcObjectRadius(beatmap.difficulty.circleSize);
  const od = beatmap.difficulty.overallDifficulty;
  const windows = calcHitWindows(od);

  const sliderDataCache = new Map<number, SliderData>();
  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const hitObject = beatmap.hitObjects[i];
    if (isSlider(hitObject)) {
      sliderDataCache.set(i, extractSliderData(hitObject as Slider));
    }
  }

  const scoringTotals = calculateMaxScoringTotals(beatmap, sliderDataCache);
  const state = createScoreState();

  let activeSpinner: ActiveSpinner | null = null;
  let activeSlider: ActiveSlider | null = null;

  for (let i = 1; i < replay.frames.length - 1; i++) {
    const frame = frames[i];
    const prevFrame = frames[i - 1];
    const left = frame.actions.has(StandardAction.LeftButton);
    const prevLeft = prevFrame.actions.has(StandardAction.LeftButton);
    const right = frame.actions.has(StandardAction.RightButton);
    const prevRight = prevFrame.actions.has(StandardAction.RightButton);
    const clicked = (!prevLeft && left) || (!prevRight && right);
    const { x, y } = frame.position;

    const currentAngle = getCursorAngle(x, y);
    let activeSliderProgress: number | undefined;

    if (activeSlider) {
      const result = processActiveSlider(
        activeSlider,
        frame.startTime,
        clicked,
        x,
        y,
        radius,
        windows,
        state,
      );
      activeSlider = result.activeSlider;
      activeSliderProgress = result.progress;
    }

    if (activeSpinner) {
      activeSpinner = processActiveSpinner(
        activeSpinner,
        frame.startTime,
        currentAngle,
        left || right,
        od,
        state,
      );
    }

    if (!activeSpinner && !activeSlider) {
      while (true) {
        const hitObject = beatmap.hitObjects[state.hitObjectIndex];
        if (!hitObject || !isCircle(hitObject)) break;
        if (frame.startTime - hitObject.startTime <= windows.miss) break;
        registerCircleHit(hitObject, frame.startTime, HitResult.Miss, state);
      }

      const hitObject = beatmap.hitObjects[state.hitObjectIndex];

      if (hitObject && isSlider(hitObject)) {
        activeSlider = {
          hitObject: hitObject as Slider,
          sliderData: sliderDataCache.get(state.hitObjectIndex)!,
          headResult: null,
          comboAtHead: 0,
        };
        const result = processActiveSlider(
          activeSlider,
          frame.startTime,
          clicked,
          x,
          y,
          radius,
          windows,
          state,
        );
        activeSlider = result.activeSlider;
        activeSliderProgress = result.progress;
      } else if (
        hitObject &&
        isSpinner(hitObject) &&
        frame.startTime >= hitObject.startTime
      ) {
        activeSpinner = {
          hitObject: hitObject as StandardSpinner,
          totalRotation: 0,
          lastAngle: currentAngle,
        };
        activeSpinner = processActiveSpinner(
          activeSpinner,
          frame.startTime,
          currentAngle,
          left || right,
          od,
          state,
        );
      } else if (hitObject && isCircle(hitObject) && clicked) {
        let hitTargetIndex = -1;
        const lookAheadLimit = state.hitObjectIndex + 1;

        for (
          let j = state.hitObjectIndex;
          j <= lookAheadLimit && j < beatmap.hitObjects.length;
          j++
        ) {
          const target = beatmap.hitObjects[j];
          if (!isCircle(target)) break;
          if (frame.startTime - target.startTime < -windows.miss) break;

          if (isInside(x, y, target.startX, target.startY, radius)) {
            hitTargetIndex = j;
            break;
          }

          if (j === state.hitObjectIndex && frame.startTime < target.startTime)
            break;
        }

        if (hitTargetIndex >= 0) {
          for (let j = state.hitObjectIndex; j < hitTargetIndex; j++) {
            registerCircleHit(
              beatmap.hitObjects[j],
              frame.startTime,
              HitResult.Miss,
              state,
            );
          }

          state.hitObjectIndex = hitTargetIndex;

          const target = beatmap.hitObjects[hitTargetIndex];
          const result = resultForOffset(
            Math.abs(frame.startTime - target.startTime),
            windows,
          );
          registerCircleHit(target, frame.startTime, result, state);
        }
      }
    }

    const { accuracy, score } = calculateLazerScore(state, scoringTotals);

    simulatedFrames.push({
      x,
      y,
      time: frame.startTime,
      score,
      combo: state.combo,
      great: state.great,
      good: state.good,
      okay: state.okay,
      miss: state.miss,
      accuracy,
      actions: frame.actions,
      angle: currentAngle,
      currentSpinnerRotation: activeSpinner
        ? activeSpinner.totalRotation
        : undefined,
      activeSliderProgress,
    });
  }

  return {
    hitObjects: state.hitObjects,
    frames: simulatedFrames,
  };
};
