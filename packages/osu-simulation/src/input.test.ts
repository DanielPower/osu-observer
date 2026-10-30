import { HitResult } from "osu-classes";
import { BeatmapDecoder } from "osu-parsers";
import { StandardAction, StandardRuleset } from "osu-standard-stable";
import { describe, expect, test } from "vitest";
import { simulateScore } from "./simulation";

// OD5 hit windows: Great 49.5ms, Ok 99.5ms, Meh 149.5ms. CS4, 120 BPM, SV 1, so a
// 100px slider lasts 500ms.
const buildBeatmap = (hitObjects: string) => {
  const osu = `osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 0

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:5
ApproachRate:5
SliderMultiplier:1
SliderTickRate:1

[TimingPoints]
0,500,4,2,0,100,1,0

[HitObjects]
${hitObjects}
`;
  return new StandardRuleset().applyToBeatmap(new BeatmapDecoder().decodeFromString(osu));
};

type Input = { x: number; y: number; keys?: StandardAction[] };

const simulate = (hitObjects: string, script: (time: number) => Input) => {
  const frames = [];
  for (let time = -20; time <= 4200; time += 5) {
    const { x, y, keys = [] } = script(time);
    frames.push({ startTime: time, position: { x, y }, actions: new Set(keys) });
  }
  const replay = { frames } as unknown as Parameters<typeof simulateScore>[0];
  return simulateScore(replay, buildBeatmap(hitObjects));
};

const L = [StandardAction.LeftButton];
const R = [StandardAction.RightButton];

const ballX = (time: number, startTime: number) =>
  300 + Math.min(100, Math.max(0, (time - startTime) / 5));

describe("lazer input model", () => {
  const map = [
    "100,100,1000,1,0",
    "300,100,1250,2,0,L|400:100,1,100",
    "100,300,1800,1,0",
    "300,300,3000,2,0,L|400:300,1,100",
  ].join("\n");

  test("objects are judged independently, with clicks too early to count ignored", () => {
    const simulation = simulate(map, (t) => {
      // Circle 1 is never clicked.
      if (t < 1250) return { x: 300, y: 100 };
      if (t < 1740) return { x: ballX(t, 1250), y: 100, keys: L };
      // Circle 3 is hit 55ms early, while slider 2 is still running.
      if (t < 1800) return { x: 100, y: 300, keys: t >= 1745 ? R : [] };
      // Slider 4 is clicked 500ms early (outside the miss window), then on time.
      if (t < 2500) return { x: 300, y: 300 };
      if (t < 2520) return { x: 300, y: 300, keys: L };
      if (t < 3000) return { x: 300, y: 300 };
      if (t <= 3500) return { x: ballX(t, 3000), y: 300, keys: L };
      return { x: 400, y: 300 };
    });

    expect(simulation.hitObjects.map((h) => h.result)).toEqual([
      HitResult.Miss,
      HitResult.Great,
      HitResult.Ok,
      HitResult.Great,
    ]);
    expect(simulation.hitObjects[1].resultTime).toBe(1250);
    expect(simulation.hitObjects[2].resultTime).toBe(1745);
    expect(simulation.hitObjects[3].resultTime).toBe(3000);
  });

  test("an unclicked circle is missed once the Meh window passes", () => {
    const simulation = simulate("100,100,1000,1,0", () => ({ x: 400, y: 300 }));
    const [circle] = simulation.hitObjects;
    expect(circle.result).toBe(HitResult.Miss);
    expect(circle.resultTime).toBe(1150);
  });

  test("note lock blocks a later circle until the earlier one's start time", () => {
    const circles = "100,100,1000,1,0\n300,100,1100,1,0";

    const locked = simulate(circles, (t) => ({
      x: 300,
      y: 100,
      keys: t >= 990 && t < 1000 ? L : [],
    }));
    expect(locked.hitObjects.map((h) => h.result)).toEqual([HitResult.Miss, HitResult.Miss]);
    expect(locked.hitObjects[1].resultTime).toBe(1250);

    const unlocked = simulate(circles, (t) => ({ x: 300, y: 100, keys: t >= 1010 ? L : [] }));
    expect(unlocked.hitObjects.map((h) => h.result)).toEqual([HitResult.Miss, HitResult.Ok]);
    expect(unlocked.hitObjects[0].resultTime).toBe(1010);
  });

  test("a late click on a stack goes to the next circle once the first is missed", () => {
    const stack = "200,200,1000,1,0\n200,200,1100,1,0";
    const simulation = simulate(stack, (t) => ({ x: 200, y: 200, keys: t >= 1160 ? L : [] }));
    expect(simulation.hitObjects.map((h) => h.result)).toEqual([HitResult.Miss, HitResult.Ok]);
  });

  test("pressing both keys in one frame counts as two presses", () => {
    const stack = "200,200,1000,1,0\n200,200,1010,1,0";
    const simulation = simulate(stack, (t) => ({
      x: 200,
      y: 200,
      keys: t >= 1010 ? [...L, ...R] : [],
    }));
    expect(simulation.hitObjects.map((h) => h.result)).toEqual([HitResult.Great, HitResult.Great]);
  });
});
