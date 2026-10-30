import type { Beatmap, BeatmapDifficultySection } from "osu-classes";
import { StandardRuleset, type StandardBeatmap } from "osu-standard-stable";

/** A lazer mod as the osu! API returns it, e.g. `{ acronym: "DT", settings: { speed_change: 1.2 } }`. */
export type LazerMod = { acronym: string; settings?: Record<string, unknown> };

const ruleset = new StandardRuleset();

// Legacy bits for the mods that change the beatmap itself. The rest only change
// presentation or the score multiplier.
const BEATMAP_MOD_BITS: Record<string, number> = { EZ: 1 << 1, HR: 1 << 4 };

const DEFAULT_RATES: Record<string, number> = { DT: 1.5, NC: 1.5, HT: 0.75, DC: 0.75 };

const numberSetting = (mod: LazerMod, key: string): number | undefined => {
  const value = mod.settings?.[key];
  return typeof value === "number" ? value : undefined;
};

const findMod = (mods: LazerMod[], acronym: string) => mods.find((m) => m.acronym === acronym);

/** The gameplay rate the mods play at, as lazer's ModRateAdjust.SpeedChange. */
export function clockRateFor(mods: LazerMod[]): number {
  for (const mod of mods) {
    const defaultRate = DEFAULT_RATES[mod.acronym];
    if (defaultRate !== undefined) return numberSetting(mod, "speed_change") ?? defaultRate;
  }
  return 1;
}

/**
 * Converts a decoded beatmap to osu!standard with the mods applied: EZ and HR
 * (including HR's vertical flip), Difficulty Adjust's overrides, and the rate.
 */
export function applyMods(beatmap: Beatmap, mods: LazerMod[]): StandardBeatmap {
  const bitwise = mods.reduce((bits, mod) => bits | (BEATMAP_MOD_BITS[mod.acronym] ?? 0), 0);
  const combination = ruleset.createModCombination(bitwise);

  const difficultyAdjust = findMod(mods, "DA");
  const clockRate = clockRateFor(mods);
  // Runs after the legacy mods (they're sorted by bit), so it sets the final values.
  combination.all.push({
    applyToDifficulty(difficulty: BeatmapDifficultySection) {
      if (difficultyAdjust) {
        difficulty.circleSize =
          numberSetting(difficultyAdjust, "circle_size") ?? difficulty.circleSize;
        difficulty.approachRate =
          numberSetting(difficultyAdjust, "approach_rate") ?? difficulty.approachRate;
        difficulty.overallDifficulty =
          numberSetting(difficultyAdjust, "overall_difficulty") ?? difficulty.overallDifficulty;
        difficulty.drainRate =
          numberSetting(difficultyAdjust, "drain_rate") ?? difficulty.drainRate;
      }
      difficulty.clockRate = clockRate;
    },
  } as unknown as (typeof combination.all)[number]);

  return ruleset.applyToBeatmapWithMods(beatmap, combination);
}

/** lazer's OsuScoreMultiplierCalculatorV2, for the mods osu-observer can simulate. */
export function scoreMultiplierFor(mods: LazerMod[], baseDifficulty: BeatmapDifficultySection) {
  const has = (acronym: string) => findMod(mods, acronym) !== undefined;
  let multiplier = 1;

  for (const mod of mods) {
    switch (mod.acronym) {
      case "EZ":
        multiplier *= Math.max(
          0.4,
          0.8 - Math.max(0, 0.1 * ((numberSetting(mod, "retries") ?? 2) - 2)),
        );
        break;
      case "NF":
        multiplier *= 0.5;
        break;
      case "HT":
      case "DC":
        multiplier *= halfTimeMultiplier(clockRateFor([mod]));
        break;
      case "HR":
        multiplier *= 1.09;
        break;
      case "DT":
      case "NC":
        multiplier *= doubleTimeMultiplier(clockRateFor([mod]));
        break;
      case "HD":
        multiplier *= has("BL") ? 1 : mod.settings?.only_fade_approach_circles ? 1.02 : 1.04;
        break;
      case "TC":
        multiplier *= has("BL") ? 1 : 1.02;
        break;
      case "BL":
        multiplier *= 1.24;
        break;
      case "FL":
        multiplier *= flashlightMultiplier(mod);
        break;
      case "DA":
        multiplier *= difficultyAdjustMultiplier(mod, baseDifficulty);
        break;
      case "SO":
        multiplier *= 0.95;
        break;
    }
  }
  return multiplier;
}

function halfTimeMultiplier(speedChange: number) {
  return (Math.trunc(speedChange * 20) / 20) * 1.4 - 0.5;
}

function doubleTimeMultiplier(speedChange: number) {
  const value = Math.trunc(speedChange * 10) / 10;
  const penalty = value !== 1.5 && value !== 1 ? 0.01 : 0;
  return (value - 1) * 0.46 + 1 - penalty;
}

function flashlightMultiplier(mod: LazerMod) {
  const size = numberSetting(mod, "size_multiplier") ?? 1;
  const value = Math.max(1.02, Math.min(1.2, 1.2 - 0.2 * (size - 1)));
  return mod.settings?.combo_based_size === false ? 1 + (value - 1) / 5 : value;
}

function difficultyAdjustMultiplier(mod: LazerMod, base: BeatmapDifficultySection) {
  const factor = (key: string, baseValue: number) =>
    Math.max(0.1, 1 - Math.abs((numberSetting(mod, key) ?? baseValue) - baseValue) * 0.5);
  return Math.max(
    0.1,
    factor("circle_size", base.circleSize) *
      factor("drain_rate", base.drainRate) *
      factor("overall_difficulty", base.overallDifficulty) *
      factor("approach_rate", base.approachRate),
  );
}
