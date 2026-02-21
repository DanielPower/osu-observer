import { HitResult, type HitType, type Replay } from "osu-classes";
import {
  StandardAction,
  StandardBeatmap,
  type StandardReplayFrame,
  Slider,
  Spinner as StandardSpinner,
} from "osu-standard-stable";
import { calcObjectRadius, getSpinsRequired, PLAYFIELD } from "./math";

// Simple coordinate type for slider path points
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
  path: Coordinate[]; // Calculated path points for rendering
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
  endTime?: number; // For spinners and sliders
  totalRotation?: number; // For spinners - total rotation achieved in radians
  slider?: SliderData; // For sliders - path and timing data
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
  angle?: number; // Cursor angle for spinner calculation
  currentSpinnerRotation?: number; // Current rotation during active spinner
  activeSliderProgress?: number; // Progress through active slider (0-1 per span)
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

// Calculate angle from center of screen to cursor position
const getCursorAngle = (x: number, y: number): number => {
  return Math.atan2(y - PLAYFIELD.centerY, x - PLAYFIELD.centerX);
};

// Calculate angular difference, handling wrap-around
const getAngularDifference = (angle1: number, angle2: number): number => {
  let diff = angle2 - angle1;
  // Normalize to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
};

// Bit flags from osu! hit types
const HIT_TYPE_SLIDER = 1 << 1;
const HIT_TYPE_SPINNER = 1 << 3;

// Extract slider data from a Slider hit object
const extractSliderData = (slider: Slider): SliderData => {
  // Get the calculated path points
  const path: Coordinate[] = slider.path.path.map((p) => ({
    x: p.x + slider.startX,
    y: p.y + slider.startY,
  }));

  // Calculate tick positions and times
  const tickPositions: { position: Coordinate; time: number }[] = [];
  const spanDuration = slider.spanDuration;

  // Generate tick times based on tick distance and velocity
  if (slider.tickDistance > 0 && slider.velocity > 0) {
    const tickInterval = slider.tickDistance / slider.velocity;
    for (let span = 0; span < slider.spans; span++) {
      const spanStartTime = slider.startTime + span * spanDuration;
      const isReverse = span % 2 === 1;

      // Generate ticks for this span (excluding start and end)
      let tickTime = tickInterval;
      while (tickTime < spanDuration - 1) {
        // -1ms to avoid floating point issues at end
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

  // Calculate repeat positions and times
  const repeatPositions: { position: Coordinate; time: number }[] = [];
  for (let i = 1; i < slider.spans; i++) {
    const isAtEnd = i % 2 === 1;
    const position = isAtEnd ? slider.endPosition : slider.startPosition;
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
    endPosition: { x: slider.endX, y: slider.endY },
  };
};

// Get the position of the slider ball at a given time
const getSliderBallPosition = (
  slider: Slider,
  time: number,
): { position: Coordinate; progress: number } | null => {
  if (time < slider.startTime || time > slider.endTime) {
    return null;
  }

  const elapsed = time - slider.startTime;
  const spanDuration = slider.spanDuration;
  const span = Math.floor(elapsed / spanDuration);
  const progressInSpan = (elapsed - span * spanDuration) / spanDuration;

  // Determine path progress based on which span we're in
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

// Mutable scoring state shared across per-type handlers
type ScoreState = {
  hitObjectIndex: number;
  baseScore: number;
  combo: number;
  great: number;
  good: number;
  okay: number;
  miss: number;
  hitObjects: HitObject[];
};

function applyResult(state: ScoreState, result: HitResult): void {
  if (result === HitResult.Great) {
    state.baseScore += 300;
    state.great += 1;
    state.combo += 1;
  } else if (result === HitResult.Ok) {
    state.baseScore += 100;
    state.good += 1;
    state.combo += 1;
  } else if (result === HitResult.Meh) {
    state.baseScore += 50;
    state.okay += 1;
    state.combo += 1;
  } else if (result === HitResult.Miss) {
    state.miss += 1;
    state.combo = 0;
  }
}

type ActiveSlider = { hitObject: Slider; sliderData: SliderData };

function processActiveSlider(
  activeSlider: ActiveSlider,
  frameTime: number,
  state: ScoreState,
): { activeSlider: ActiveSlider | null; progress: number | undefined } {
  const sliderBallPos = getSliderBallPosition(
    activeSlider.hitObject,
    frameTime,
  );
  const progress = sliderBallPos?.progress;

  // Check if slider is complete
  if (frameTime >= activeSlider.hitObject.endTime) {
    // Auto-pass sliders as 300 for now (TODO: implement proper slider scoring)
    applyResult(state, HitResult.Great);
    state.hitObjects.push({
      x: activeSlider.hitObject.startX,
      y: activeSlider.hitObject.startY,
      time: activeSlider.hitObject.startTime,
      resultTime: activeSlider.hitObject.endTime,
      endTime: activeSlider.hitObject.endTime,
      result: HitResult.Great,
      type: activeSlider.hitObject.hitType,
      slider: activeSlider.sliderData,
    });
    state.hitObjectIndex += 1;
    return { activeSlider: null, progress };
  }

  return { activeSlider, progress };
}

type ActiveSpinner = {
  hitObject: StandardSpinner;
  totalRotation: number;
  lastAngle: number;
  isSpinning: boolean;
};

function processActiveSpinner(
  activeSpinner: ActiveSpinner,
  frameTime: number,
  currentAngle: number,
  isHolding: boolean,
  od: number,
  state: ScoreState,
): ActiveSpinner | null {
  if (isHolding) {
    const angleDiff = getAngularDifference(
      activeSpinner.lastAngle,
      currentAngle,
    );
    activeSpinner.totalRotation += Math.abs(angleDiff);
    activeSpinner.lastAngle = currentAngle;
    activeSpinner.isSpinning = true;
  }

  // Check if spinner is complete
  if (frameTime >= activeSpinner.hitObject.endTime) {
    const duration =
      activeSpinner.hitObject.endTime - activeSpinner.hitObject.startTime;
    const spinsRequired = getSpinsRequired(duration, od);
    const completedSpins = activeSpinner.totalRotation / (2 * Math.PI);
    const completionRatio = completedSpins / spinsRequired;

    let result: HitResult;
    if (completionRatio >= 1.0) {
      result = HitResult.Great;
    } else if (completionRatio > 0.9) {
      result = HitResult.Ok;
    } else if (completionRatio > 0.75) {
      result = HitResult.Meh;
    } else {
      result = HitResult.Miss;
    }
    applyResult(state, result);

    state.hitObjects.push({
      x: PLAYFIELD.centerX,
      y: PLAYFIELD.centerY,
      time: activeSpinner.hitObject.startTime,
      resultTime: frameTime,
      endTime: activeSpinner.hitObject.endTime,
      totalRotation: activeSpinner.totalRotation,
      result,
      type: activeSpinner.hitObject.hitType,
    });

    state.hitObjectIndex += 1;
    return null;
  }

  return activeSpinner;
}

function processCircleHit(
  hitObject: StandardBeatmap["hitObjects"][number],
  frameTime: number,
  clicked: boolean,
  x: number,
  y: number,
  radius: number,
  state: ScoreState,
): void {
  let result: HitResult = HitResult.None;

  if (!hitObject.hitWindows.canBeHit(frameTime - hitObject.startTime)) {
    result = HitResult.Miss;
  } else if (
    clicked &&
    isInside(x, y, hitObject.startX, hitObject.startY, radius)
  ) {
    result = hitObject.hitWindows.resultFor(hitObject.startTime - frameTime);
  }

  if (result !== HitResult.None) {
    applyResult(state, result);
    state.hitObjectIndex += 1;
    state.hitObjects.push({
      x: hitObject.startX,
      y: hitObject.startY,
      time: hitObject.startTime,
      resultTime: frameTime,
      result,
      type: hitObject.hitType,
    });
  }
}

export const simulateScore = (
  replay: Replay,
  beatmap: StandardBeatmap,
): Simulation => {
  const simulatedFrames: SimulatedFrame[] = [];
  const frames = replay.frames as StandardReplayFrame[];
  const radius = calcObjectRadius(beatmap.difficulty.circleSize);
  const od = beatmap.difficulty.overallDifficulty;

  const state: ScoreState = {
    hitObjectIndex: 0,
    baseScore: 0,
    combo: 0,
    great: 0,
    good: 0,
    okay: 0,
    miss: 0,
    hitObjects: [],
  };

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

    // Handle active slider
    if (activeSlider) {
      const result = processActiveSlider(
        activeSlider,
        frame.startTime,
        state,
      );
      activeSlider = result.activeSlider;
      activeSliderProgress = result.progress;
    }

    // Handle active spinner
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

    // Process next hit object if no active spinner/slider
    const hitObject = beatmap.hitObjects[state.hitObjectIndex];
    if (hitObject && !activeSpinner && !activeSlider) {
      if (hitObject.hitType & HIT_TYPE_SLIDER) {
        if (frame.startTime >= hitObject.startTime) {
          const slider = hitObject as Slider;
          activeSlider = {
            hitObject: slider,
            sliderData: extractSliderData(slider),
          };
        }
      } else if (
        hitObject.hitType & HIT_TYPE_SPINNER &&
        frame.startTime >= hitObject.startTime
      ) {
        activeSpinner = {
          hitObject: hitObject as StandardSpinner,
          totalRotation: 0,
          lastAngle: currentAngle,
          isSpinning: false,
        };
      } else {
        processCircleHit(
          hitObject,
          frame.startTime,
          clicked,
          x,
          y,
          radius,
          state,
        );
      }
    }

    simulatedFrames.push({
      x,
      y,
      time: frame.startTime,
      score: state.baseScore,
      combo: state.combo,
      great: state.great,
      good: state.good,
      okay: state.okay,
      miss: state.miss,
      accuracy: state.baseScore / (state.hitObjectIndex * 300) || 1,
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
