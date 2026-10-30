import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HitResult } from "osu-classes";
import { BeatmapDecoder } from "osu-parsers";
import { expect, test } from "vitest";
import type { LazerMod } from "./mods";
import { decodeReplayFrames, encodeReplayFrames, readReplayFrames } from "./replay";
import { frameAt, simulateScore, type HitObject } from "./simulation";

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
};

type LazerResults = {
  totalScore: number;
  accuracy: number;
  maxCombo: number;
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
});
