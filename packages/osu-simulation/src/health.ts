import { HitResult } from "osu-classes";
import {
  SliderHead,
  SliderRepeat,
  SliderTail,
  SliderTick,
  type StandardBeatmap,
} from "osu-standard-stable";
import type { LazerMod } from "./mods";

/** The kind of object a judgement belongs to, as lazer's nested hit objects. */
export type JudgementKind =
  | "circle"
  | "sliderHead"
  | "sliderTick"
  | "sliderRepeat"
  | "sliderTail"
  | "slider"
  | "spinnerTick"
  | "spinner";

export type Judgement = {
  /** Index of the top-level hit object the judgement belongs to. */
  objectIndex: number;
  kind: JudgementKind;
  result: HitResult;
  time: number;
};

/** Tracks health through a play. One is created per simulation. */
export type HealthProcessor = {
  /** Drains health up to `time`, which never goes backwards. */
  drainTo(time: number): void;
  applyJudgement(judgement: Judgement): void;
  readonly health: number;
  /** Health lost per millisecond outside breaks. */
  readonly drainRate: number;
  /** When the play failed (and a mod didn't prevent it), or null. */
  readonly failTime: number | null;
};

/** A set of health rules (lazer's today; stable's could be added later). */
export type HealthRules = (beatmap: StandardBeatmap, mods: LazerMod[]) => HealthProcessor;

const HIT_TYPE_NEW_COMBO = 1 << 2;
const HIT_TYPE_SLIDER = 1 << 1;
const HIT_TYPE_SPINNER = 1 << 3;

// IBeatmapDifficultyInfo.DifficultyRange, written as lazer does for identical rounding.
const difficultyRange = (difficulty: number, min: number, mid: number, max: number): number => {
  if (difficulty > 5) return mid + (max - mid) * ((difficulty - 5) / 5);
  if (difficulty < 5) return mid + (mid - min) * ((difficulty - 5) / 5);
  return mid;
};

const isHit = (result: HitResult) =>
  result !== HitResult.None &&
  result !== HitResult.IgnoreMiss &&
  result !== HitResult.Miss &&
  result !== HitResult.SmallTickMiss &&
  result !== HitResult.LargeTickMiss;

// DrainingHealthProcessor's targets for the lowest health of a perfect play.
const MIN_HEALTH_TARGET = 0.99;
const MID_HEALTH_TARGET = 0.9;
const MAX_HEALTH_TARGET = 0.4;
const MINIMUM_HEALTH_ERROR = 0.01;

// OsuHealthProcessor.getHealthIncreaseFor.
function baseHealthIncrease(kind: JudgementKind, result: HitResult, drainRate: number): number {
  switch (result) {
    case HitResult.SmallTickMiss:
    case HitResult.LargeTickMiss:
      return difficultyRange(drainRate, -0.02, -0.075, -0.14);
    case HitResult.Miss:
      return difficultyRange(drainRate, -0.03, -0.125, -0.2);
    case HitResult.SmallTickHit:
      return 0.02;
    case HitResult.LargeTickHit:
      return kind === "sliderTick" ? 0.015 : 0.02;
    case HitResult.Meh:
      return 0.002;
    case HitResult.Ok:
      return 0.011;
    case HitResult.Great:
      return 0.03;
    case HitResult.SmallBonus:
      return 0.0085;
    case HitResult.LargeBonus:
      return 0.01;
    default:
      return 0;
  }
}

// lazer's HitResult.SliderTailHit has no equivalent in osu-classes, so the simulator
// reports a hit tail as LargeTickHit, which has the same health value.
const PERFECT_RESULTS: Record<JudgementKind, HitResult> = {
  circle: HitResult.Great,
  sliderHead: HitResult.Great,
  sliderTick: HitResult.LargeTickHit,
  sliderRepeat: HitResult.LargeTickHit,
  sliderTail: HitResult.LargeTickHit,
  slider: HitResult.IgnoreHit,
  spinnerTick: HitResult.SmallBonus,
  spinner: HitResult.Great,
};

type ComboFlags = { newCombo: boolean[]; lastInCombo: boolean[] };

// lazer's ConvertHitObjectParser forces a new combo on the first object and the one
// after a spinner, and OsuHitObject.UpdateComboInformation marks the object before
// a new combo (never a spinner's own flag) as the last in its combo.
function comboFlags(beatmap: StandardBeatmap): ComboFlags {
  const objects = beatmap.hitObjects;
  const newCombo = objects.map((hitObject, i) => {
    const raw = (hitObject.hitType & HIT_TYPE_NEW_COMBO) !== 0;
    if (hitObject.hitType & HIT_TYPE_SPINNER) return raw;
    return raw || i === 0 || (objects[i - 1].hitType & HIT_TYPE_SPINNER) !== 0;
  });
  const lastInCombo = objects.map(() => false);
  for (let i = 1; i < objects.length; i++) {
    const startsCombo =
      (objects[i].hitType & HIT_TYPE_SPINNER) === 0 &&
      (newCombo[i] || (objects[i - 1].hitType & HIT_TYPE_SPINNER) !== 0);
    if (startsCombo) lastInCombo[i - 1] = true;
  }
  return { newCombo, lastInCombo };
}

type HealthIncrease = { time: number; amount: number };

// The judgements of a perfect play, in lazer's JudgementProcessor.SimulateAutoplay
// order (each object's nested objects by start time, then the object), without bonus.
function perfectPlayIncreases(beatmap: StandardBeatmap, drainRate: number): HealthIncrease[] {
  const increases: HealthIncrease[] = [];
  const add = (kind: JudgementKind, time: number) =>
    increases.push({ time, amount: baseHealthIncrease(kind, PERFECT_RESULTS[kind], drainRate) });

  for (const hitObject of beatmap.hitObjects) {
    const endTime = (hitObject as { endTime?: number }).endTime ?? hitObject.startTime;
    if (hitObject.hitType & HIT_TYPE_SLIDER) {
      // osu-standard-stable places the tail at stable's legacy last tick; lazer's
      // tail is at the slider's end.
      const nested = hitObject.nestedHitObjects
        .map((n) => {
          const kind = sliderNestedKind(n);
          return { kind, time: kind === "sliderTail" ? endTime : n.startTime };
        })
        .filter((n): n is { time: number; kind: JudgementKind } => n.kind !== null)
        .sort((a, b) => a.time - b.time);
      for (const n of nested) add(n.kind, n.time);
      add("slider", endTime);
    } else if (hitObject.hitType & HIT_TYPE_SPINNER) {
      add("spinner", endTime);
    } else {
      add("circle", hitObject.startTime);
    }
  }
  return increases;
}

function sliderNestedKind(nested: unknown): JudgementKind | null {
  if (nested instanceof SliderHead) return "sliderHead";
  if (nested instanceof SliderTick) return "sliderTick";
  if (nested instanceof SliderRepeat) return "sliderRepeat";
  if (nested instanceof SliderTail) return "sliderTail";
  return null;
}

type Break = { startTime: number; endTime: number };

// DrainingHealthProcessor.ComputeDrainRate: a binary search for the drain rate
// whose perfect play bottoms out at the target health.
function computeDrainRate(
  increases: HealthIncrease[],
  breaks: Break[],
  drainStartTime: number,
  targetMinimumHealth: number,
): number {
  if (increases.length <= 1) return 0;

  let adjustment = 1;
  let result = 1;

  // lazer stops once `adjustment` (an int) overflows; 2^31 is where it would.
  while (adjustment > 0 && adjustment < 2 ** 31) {
    let currentHealth = 1;
    let lowestHealth = 1;
    let currentBreak = 0;

    for (let i = 0; i < increases.length; i++) {
      const currentTime = increases[i].time;
      let lastTime = i > 0 ? increases[i - 1].time : drainStartTime;

      while (currentBreak < breaks.length && breaks[currentBreak].endTime <= currentTime) {
        lastTime = currentTime;
        currentBreak++;
      }

      currentHealth -= (currentTime - lastTime) * result;
      lowestHealth = Math.min(lowestHealth, currentHealth);
      currentHealth = Math.min(1, currentHealth + increases[i].amount);

      if (lowestHealth < 0) break;
    }

    if (Math.abs(lowestHealth - targetMinimumHealth) <= MINIMUM_HEALTH_ERROR) break;

    adjustment *= 2;
    result += (1 / adjustment) * Math.sign(lowestHealth - targetMinimumHealth);
  }

  return result;
}

// The periods around breaks without drain: from the end of the last object before
// the break to the start of the first object after it.
function noDrainPeriods(beatmap: StandardBeatmap, breaks: Break[]): Break[] {
  const objects = beatmap.hitObjects;
  return breaks
    .map((b) => {
      let startTime = -Infinity;
      for (const o of objects) {
        const endTime = (o as { endTime?: number }).endTime ?? o.startTime;
        if (endTime <= b.startTime) startTime = endTime;
      }
      const after = objects.find((o) => o.startTime >= b.endTime);
      return { startTime, endTime: after?.startTime ?? Infinity };
    })
    .sort((a, b) => a.startTime - b.startTime);
}

// The time in [from, to] that's outside every period.
function drainingTime(from: number, to: number, periods: Break[]): number {
  let total = to - from;
  for (const p of periods) {
    const overlap = Math.min(to, p.endTime) - Math.max(from, p.startTime);
    if (overlap > 0) total -= overlap;
  }
  return total;
}

const DEFAULT_EXTRA_LIVES = 2;

/** osu!lazer's OsuHealthProcessor, with NoFail and Easy's extra lives. */
export const lazerHealthRules: HealthRules = (beatmap, mods) => {
  const drainRate = beatmap.difficulty.drainRate;
  const objects = beatmap.hitObjects;
  const breaks: Break[] = beatmap.events.breaks.map((b) => ({
    startTime: b.startTime,
    endTime: b.endTime,
  }));

  const drainStartTime = objects.length > 0 ? objects[0].startTime : 0;
  const last = objects.at(-1);
  const gameplayEndTime = last ? ((last as { endTime?: number }).endTime ?? last.startTime) : 0;
  const targetMinimumHealth = Math.min(
    1,
    Math.max(
      0,
      difficultyRange(drainRate, MIN_HEALTH_TARGET, MID_HEALTH_TARGET, MAX_HEALTH_TARGET),
    ),
  );
  const healthDrainRate = computeDrainRate(
    perfectPlayIncreases(beatmap, drainRate),
    breaks,
    drainStartTime,
    targetMinimumHealth,
  );
  const periods = noDrainPeriods(beatmap, breaks);
  const { newCombo, lastInCombo } = comboFlags(beatmap);

  const noFail = mods.some((m) => m.acronym === "NF");
  const easy = mods.find((m) => m.acronym === "EZ");
  const retriesSetting = easy?.settings?.retries;
  let retries = easy
    ? typeof retriesSetting === "number"
      ? retriesSetting
      : DEFAULT_EXTRA_LIVES
    : 0;

  let health = 1;
  let failTime: number | null = null;
  let drainedTo = drainStartTime;
  // OsuHealthProcessor's ComboResult: 2 Perfect, 1 Good, 0 None.
  let comboResult = 2;

  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  const healthIncrease = ({ objectIndex, kind, result }: Judgement): number => {
    const topLevel = kind === "circle" || kind === "slider" || kind === "spinner";
    if (topLevel && newCombo[objectIndex]) comboResult = 2;

    if (result === HitResult.LargeTickMiss || result === HitResult.Ok) {
      comboResult = Math.min(comboResult, 1);
    } else if (result === HitResult.Meh || result === HitResult.Miss) {
      comboResult = 0;
    }
    if (kind === "sliderTail" && !isHit(result)) comboResult = Math.min(comboResult, 1);

    const increase = baseHealthIncrease(kind, result, drainRate);
    if (topLevel && lastInCombo[objectIndex] && isHit(result)) {
      return increase + [0.03, 0.05, 0.07][comboResult];
    }
    return increase;
  };

  return {
    drainTo(time) {
      const to = Math.min(time, gameplayEndTime);
      if (to <= drainedTo) return;
      health = clamp(health - healthDrainRate * drainingTime(drainedTo, to, periods));
      drainedTo = to;
    },
    applyJudgement(judgement) {
      health = clamp(health + healthIncrease(judgement));

      // HealthProcessor's fail check (Precision.AlmostBigger(0, health)), which
      // NoFail refuses and Easy answers by refilling health while it has lives.
      const canFail = judgement.kind !== "spinnerTick" && judgement.result !== HitResult.IgnoreHit;
      if (!canFail || failTime !== null || health >= 1e-7 || noFail) return;
      if (retries > 0) {
        retries--;
        health = 1;
        return;
      }
      failTime = judgement.time;
    },
    get health() {
      return health;
    },
    drainRate: healthDrainRate,
    get failTime() {
      return failTime;
    },
  };
};
