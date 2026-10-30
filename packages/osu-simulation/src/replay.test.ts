import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScoreDecoder } from "osu-parsers";
import { StandardRuleset, type StandardReplayFrame } from "osu-standard-stable";
import { expect, test } from "vitest";
import { decodeReplayFrames, decodeScore, encodeReplayFrames, readReplayFrames } from "./replay";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../test/data");
const osrFiles = ["replays", "scenarios"].flatMap((dir) =>
  readdirSync(join(dataDir, dir))
    .filter((file) => file.endsWith(".osr"))
    .map((file) => join(dir, file)),
);

test.each(osrFiles)("decodes the same replay as osu-parsers - %s", async (file) => {
  const bytes = readFileSync(join(dataDir, file));
  const expected = await new ScoreDecoder().decodeFromBuffer(bytes);
  const actual = await decodeScore(bytes);

  expect(actual.replay).not.toBeNull();
  expect(actual.replay).toEqual(expected.replay);
  expect(actual.info).toEqual(expected.info);
});

// The frames as plain values, in the shape the standard ruleset gives them.
const standardFrames = (frames: StandardReplayFrame[]) =>
  frames.map((frame) => ({
    time: frame.startTime,
    x: frame.position.x,
    y: frame.position.y,
    actions: [...frame.actions].reduce((bits, action) => bits | (1 << action), 0),
  }));

test.each(osrFiles)("decodes the same frames as the standard ruleset - %s", async (file) => {
  const bytes = readFileSync(join(dataDir, file));
  const score = await new ScoreDecoder().decodeFromBuffer(bytes);
  const expected = standardFrames(
    new StandardRuleset().applyToReplay(score.replay!).frames as StandardReplayFrame[],
  );

  const frames = decodeReplayFrames(bytes);
  expect(
    Array.from({ length: frames.length }, (_, i) => ({
      time: frames.time[i],
      x: frames.x[i],
      y: frames.y[i],
      actions: frames.actions[i],
    })),
  ).toEqual(expected);
  expect(readReplayFrames(encodeReplayFrames(frames))).toEqual(frames);
});

test("rejects a file that isn't replay frames", () => {
  expect(() => readReplayFrames(new Uint8Array(32))).toThrow("Not a replay frames file");
});
