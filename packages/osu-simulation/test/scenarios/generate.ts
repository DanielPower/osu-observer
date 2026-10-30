import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LegacyReplayFrame,
  Replay,
  ReplayButtonState,
  Score,
  ScoreInfo,
  Vector2,
} from "osu-classes";
import { ScoreEncoder } from "osu-parsers";
import { beatmapFor, scenarios, type Key } from "./scenarios.ts";

// lazer's LegacyScoreEncoder.FIRST_LAZER_VERSION: decoded as a lazer score (no
// Classic mod), and old enough that no lazer-specific score data block is expected.
const LAZER_REPLAY_VERSION = 30000000;
const FRAME_INTERVAL_MS = 5;

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../data/scenarios");
mkdirSync(outDir, { recursive: true });

const buttonState = (keys: Key[]) =>
  keys.reduce(
    (state, key) =>
      state |
      // A keyboard key sets both its key bit and the matching mouse bit.
      (key === "K1"
        ? ReplayButtonState.Left1 | ReplayButtonState.Left2
        : ReplayButtonState.Right1 | ReplayButtonState.Right2),
    ReplayButtonState.None,
  );

await Promise.all(
  scenarios.map(async (scenario) => {
    const osu = beatmapFor(scenario);
    writeFileSync(join(outDir, `${scenario.name}.osu`), osu);

    const replay = new Replay();
    replay.gameVersion = LAZER_REPLAY_VERSION;
    let lastTime = 0;
    for (let time = 0; time <= scenario.endTime; time += FRAME_INTERVAL_MS) {
      const { x, y, keys = [] } = scenario.input(time);
      replay.frames.push(
        new LegacyReplayFrame(time, time - lastTime, new Vector2(x, y), buttonState(keys)),
      );
      lastTime = time;
    }

    const info = new ScoreInfo();
    info.id = 1;
    info.rulesetId = 0;
    info.username = "osu-observer";
    info.beatmapHashMD5 = createHash("md5").update(osu).digest("hex");
    info.date = new Date("2026-01-01T00:00:00Z");

    const bytes = await new ScoreEncoder().encodeToBuffer(new Score(info, replay));
    writeFileSync(join(outDir, `${scenario.name}.osr`), new Uint8Array(bytes));
    console.log(`Wrote ${scenario.name}`);
  }),
);
