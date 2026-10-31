import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HitResult } from "osu-classes";
import { BeatmapDecoder } from "osu-parsers";
import { expect, test } from "vitest";
import { lazerHealthRules } from "./health";
import { applyMods, type LazerMod } from "./mods";
import { decodeReplayFrames, encodeReplayFrames, readReplayFrames } from "./replay";
import { frameAt, frameIndexAt, simulateScore, type HitObject } from "./simulation";

// Each replay is a .osu/.osr pair with the results osu!lazer's ReplayPlayer
// produced for it in <name>.lazer.json (see tools/lazer-replay-judge).
// test/data/replays holds real lazer scores, and test/data/scenarios holds
// replays written by test/scenarios/generate.ts to exercise specific rules.

type LazerJudgement = {
  objectIndex: number;
  hitObject: string;
  time: number;
  result: string;
  comboAfter: number;
  healthAfter: number;
};

type LazerResults = {
  totalScore: number;
  accuracy: number;
  maxCombo: number;
  drainRate: number;
  judgements: LazerJudgement[];
};

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../test/data");
const replays = ["replays", "scenarios"].flatMap((dir) =>
  readdirSync(join(dataDir, dir))
    .filter((f) => f.endsWith(".lazer.json"))
    .map((f) => join(dir, f.replace(/\.lazer\.json$/, ""))),
);

const RESULTS: Record<string, HitResult> = {
  Great: HitResult.Great,
  Ok: HitResult.Ok,
  Meh: HitResult.Meh,
  Miss: HitResult.Miss,
};

// lazer judges on its own gameplay clock, which steps between replay frames
// (a slider tail is judged on the first step after its start, a spinner at its
// end time), while the simulation only sees the replay frames. So times are
// compared by the replay frame they fall on: the first frame at or after them.
type ToFrame = (time: number) => number;

// The parts of lazer's judgements that the simulation reports per hit object.
function expectedHitObject(judgements: LazerJudgement[], toFrame: ToFrame) {
  const judged = (type: string) => judgements.find((j) => j.hitObject === type);
  const head = judged("HitCircle") ?? judged("SliderHeadCircle") ?? judged("Spinner");
  const tail = judged("SliderTailCircle");
  return {
    result: head && RESULTS[head.result],
    resultTime: head && toFrame(head.time),
    ...(tail && {
      endResult: tail.result === "SliderTailHit" ? HitResult.Great : HitResult.Miss,
      endResultTime: toFrame(tail.time),
    }),
  };
}

function actualHitObject(
  { result, resultTime, endResult, endResultTime }: HitObject,
  toFrame: ToFrame,
) {
  return {
    result,
    resultTime: toFrame(resultTime),
    ...(endResult !== undefined && { endResult, endResultTime: toFrame(endResultTime!) }),
  };
}

test.each(replays)("matches lazer - %s", (name) => {
  const path = join(dataDir, name);
  const lazer = JSON.parse(readFileSync(`${path}.lazer.json`, "utf8")) as LazerResults;
  const beatmap = new BeatmapDecoder().decodeFromBuffer(readFileSync(`${path}.osu`));
  // Simulated from stored frames, as the browser does.
  const frames = readReplayFrames(
    encodeReplayFrames(decodeReplayFrames(readFileSync(`${path}.osr`))),
  );

  // The score's lazer mods, when it has any (see tools/lazer-replay-judge).
  const mods = existsSync(`${path}.mods.json`)
    ? (JSON.parse(readFileSync(`${path}.mods.json`, "utf8")) as LazerMod[])
    : [];

  const simulation = simulateScore(frames, beatmap, mods);

  const frameTimes = Array.from(frames.time);
  const toFrame: ToFrame = (time) => frameTimes.find((t) => t >= time) ?? time;

  expect(simulation.hitObjects.map((h) => actualHitObject(h, toFrame))).toEqual(
    simulation.hitObjects.map((_, i) =>
      expectedHitObject(
        lazer.judgements.filter((j) => j.objectIndex === i),
        toFrame,
      ),
    ),
  );
  expect(Math.max(0, ...simulation.frames.combo)).toBe(lazer.maxCombo);
  const final = frameAt(simulation.frames, simulation.frames.length - 1);
  expect(final.combo).toBe(lazer.judgements.at(-1)!.comboAfter);

  expect(final.score).toBe(lazer.totalScore);
  expect(final.accuracy).toBeCloseTo(lazer.accuracy, 10);

  expect(lazerHealthRules(applyMods(beatmap, mods), mods).drainRate).toBe(lazer.drainRate);

  // lazer's health after the last judgement on each frame, against the simulated
  // health on that frame (the last one, when several share its time). A judgement
  // is never on an earlier frame than the one before it: ticks held back by an
  // unjudged slider head keep their own times. Spinner ticks are left out: lazer
  // completes spins between replay frames, so a tick can come a frame later here,
  // while the spinner's own judgement sees them all.
  const expectedHealth = new Map<number, number>();
  let judgedFrame = 0;
  for (const judgement of lazer.judgements) {
    judgedFrame = Math.max(
      judgedFrame,
      frameIndexAt(simulation.frames, toFrame(judgement.time)) - 1,
    );
    if (judgement.hitObject.startsWith("Spinner") && judgement.hitObject !== "Spinner") {
      expectedHealth.delete(judgedFrame);
    } else {
      expectedHealth.set(judgedFrame, judgement.healthAfter);
    }
  }
  const healthMismatches = [...expectedHealth]
    .filter(([frame, health]) => Math.abs(simulation.frames.health[frame] - health) > 0.001)
    .map(([frame, health]) => ({
      time: simulation.frames.time[frame],
      lazer: health,
      simulated: simulation.frames.health[frame],
    }));
  expect(healthMismatches).toEqual([]);
});
