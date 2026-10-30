import { HitResult } from "osu-classes";
import type { Simulation } from "osu-renderer";

export type Grade = "XH" | "X" | "SH" | "S" | "A" | "B" | "C" | "D";

export type ScoreSummary = {
  score: number;
  accuracy: number;
  maxCombo: number;
  great: number;
  ok: number;
  meh: number;
  miss: number;
  grade: Grade;
};

export type JudgementKind = "miss" | "meh" | "ok";

export type JudgementMark = {
  time: number;
  kind: JudgementKind;
  label: string;
};

// Mirrors lazer's OsuScoreProcessor.RankFromScore: accuracy cutoffs, S and SS capped at A by any
// miss, and Hidden / Flashlight turning S and SS silver (ModHidden / ModFlashlight.AdjustRank).
export function gradeFromScore(accuracy: number, misses: number, mods: string[]): Grade {
  let grade: Grade;
  if (accuracy >= 1) grade = "X";
  else if (accuracy >= 0.95) grade = "S";
  else if (accuracy >= 0.9) grade = "A";
  else if (accuracy >= 0.8) grade = "B";
  else if (accuracy >= 0.7) grade = "C";
  else grade = "D";

  if ((grade === "X" || grade === "S") && misses > 0) grade = "A";

  const silver = mods.includes("HD") || mods.includes("FL");
  if (silver && grade === "X") return "XH";
  if (silver && grade === "S") return "SH";
  return grade;
}

export function summarizeSimulation(simulation: Simulation, mods: string[]): ScoreSummary | null {
  const { frames } = simulation;
  const last = frames.length - 1;
  if (last < 0) return null;
  let maxCombo = 0;
  for (const combo of frames.combo) {
    if (combo > maxCombo) maxCombo = combo;
  }
  return {
    score: frames.score[last],
    accuracy: frames.accuracy[last],
    maxCombo,
    great: frames.great[last],
    ok: frames.good[last],
    meh: frames.okay[last],
    miss: frames.miss[last],
    grade: gradeFromScore(frames.accuracy[last], frames.miss[last], mods),
  };
}

export function judgementMarks(simulation: Simulation): JudgementMark[] {
  const marks: JudgementMark[] = [];
  for (const object of simulation.hitObjects) {
    if (object.result === HitResult.Miss) {
      marks.push({ time: object.resultTime, kind: "miss", label: "Miss" });
    } else if (object.result === HitResult.Meh) {
      marks.push({ time: object.resultTime, kind: "meh", label: "50" });
    } else if (object.result === HitResult.Ok) {
      marks.push({ time: object.resultTime, kind: "ok", label: "100" });
    }
    if (object.endResult === HitResult.Miss && object.endResultTime !== undefined) {
      marks.push({ time: object.endResultTime, kind: "miss", label: "Slider end miss" });
    }
  }
  return marks.sort((a, b) => a.time - b.time);
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}
