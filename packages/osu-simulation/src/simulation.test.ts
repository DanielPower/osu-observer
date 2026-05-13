import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BeatmapDecoder, ScoreDecoder } from "osu-parsers";
import { test, expect } from "vitest";
import { simulateScore } from "./simulation";
import { StandardRuleset } from "osu-standard-stable";

const dirName = dirname(fileURLToPath(import.meta.url));

const beatmapDecoder = new BeatmapDecoder();
const scoreDecoder = new ScoreDecoder();
const standardRuleset = new StandardRuleset();

const beatmapsDir = join(dirName, "../test/data/beatmaps");
const beatmapFiles = readdirSync(beatmapsDir).filter((f) => f.endsWith(".osu"));
const beatmapHashMap = new Map(
  beatmapFiles.map((f) => {
    const buffer = readFileSync(join(beatmapsDir, f));
    const hash = createHash("md5").update(buffer).digest("hex");
    const beatmap = beatmapDecoder.decodeFromBuffer(buffer);
    return [hash, beatmap] as const;
  }),
);

const replaysDir = join(dirName, "../test/data/scores");
const replayFiles = readdirSync(replaysDir).filter((f) => f.endsWith(".osr"));

test.each(replayFiles)("Replay simulation - %s", async (replayFile) => {
  const score = await scoreDecoder.decodeFromPath(join(replaysDir, replayFile));
  const beatmap = beatmapHashMap.get(score.info.beatmapHashMD5);

  if (!score.replay) {
    throw new Error("Replay not found");
  }
  if (!beatmap) {
    throw new Error("Beatmap not found");
  }

  const standardBeatmap = standardRuleset.applyToBeatmap(beatmap);
  const standardReplay = standardRuleset.applyToReplay(score.replay);
  const simulation = simulateScore(standardReplay, standardBeatmap);

  const results = simulation.frames[simulation.frames.length - 1];
  expect.soft(results.great).toEqual(score.info.count300);
  expect.soft(results.good).toEqual(score.info.count100);
  expect.soft(results.okay).toEqual(score.info.count50);
  expect.soft(results.miss).toEqual(score.info.countMiss);
  expect.soft(results.accuracy).toEqual(score.info.accuracy);
  // expect(results.score).toEqual(score.info.totalScore);
});
