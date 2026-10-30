import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScoreDecoder } from "osu-parsers";
import { expect, test } from "vitest";
import { decodeScore } from "./replay";

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
