import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HitResult } from "osu-classes";
import { BeatmapDecoder, ScoreDecoder } from "osu-parsers";
import { StandardRuleset } from "osu-standard-stable";
import { expect, test } from "vitest";
import { simulateScore, type HitObject } from "./simulation";

// Each scenario is a .osu/.osr pair from test/scenarios/generate.ts, with the
// results osu!lazer's ReplayPlayer produced for it in <name>.lazer.json (see
// tools/lazer-replay-judge).

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

const scenariosDir = join(dirname(fileURLToPath(import.meta.url)), "../test/data/scenarios");
const scenarios = readdirSync(scenariosDir)
  .filter((f) => f.endsWith(".lazer.json"))
  .map((f) => f.replace(/\.lazer\.json$/, ""));

const ruleset = new StandardRuleset();

const RESULTS: Record<string, HitResult> = {
  Great: HitResult.Great,
  Ok: HitResult.Ok,
  Meh: HitResult.Meh,
  Miss: HitResult.Miss,
};

// The parts of lazer's judgements that the simulation reports per hit object.
function expectedHitObject(judgements: LazerJudgement[]) {
  const judged = (type: string) => judgements.find((j) => j.hitObject === type);
  const head = judged("HitCircle") ?? judged("SliderHeadCircle") ?? judged("Spinner");
  const tail = judged("SliderTailCircle");
  return {
    result: head && RESULTS[head.result],
    resultTime: head?.time,
    ...(tail && {
      endResult: tail.result === "SliderTailHit" ? HitResult.Great : HitResult.Miss,
      endResultTime: tail.time,
    }),
  };
}

function actualHitObject({ result, resultTime, endResult, endResultTime }: HitObject) {
  return {
    result,
    resultTime,
    ...(endResult !== undefined && { endResult, endResultTime }),
  };
}

test.each(scenarios)("matches lazer - %s", async (name) => {
  const lazer = JSON.parse(
    readFileSync(join(scenariosDir, `${name}.lazer.json`), "utf8"),
  ) as LazerResults;
  const beatmap = new BeatmapDecoder().decodeFromBuffer(
    readFileSync(join(scenariosDir, `${name}.osu`)),
  );
  const score = await new ScoreDecoder().decodeFromBuffer(
    readFileSync(join(scenariosDir, `${name}.osr`)),
  );

  const simulation = simulateScore(
    ruleset.applyToReplay(score.replay!),
    ruleset.applyToBeatmap(beatmap),
  );

  expect(simulation.hitObjects.map(actualHitObject)).toEqual(
    simulation.hitObjects.map((_, i) =>
      expectedHitObject(lazer.judgements.filter((j) => j.objectIndex === i)),
    ),
  );
  expect(Math.max(0, ...simulation.frames.map((f) => f.combo))).toBe(lazer.maxCombo);
  expect(simulation.frames.at(-1)!.combo).toBe(lazer.judgements.at(-1)!.comboAfter);
});
