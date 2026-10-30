// Hand-scripted replays for mechanics the real replay fixtures don't cover.
// `pnpm --filter osu-simulation generate-scenarios` writes each one as a .osu and
// .osr pair under test/data/scenarios, so they can be played back in lazer and the
// results recorded as the expected values.
//
// Maps use OD5 (Great 49.5ms, Ok 99.5ms, Meh 149.5ms), CS4 (radius ~36.5px),
// 120 BPM and SV 1, so a 100px slider lasts 500ms.

import type { LazerMod } from "../../src/mods.ts";

export type Key = "K1" | "K2";
export type Input = { x: number; y: number; keys?: Key[] };

export type Scenario = {
  name: string;
  description: string;
  hitObjects: string[];
  endTime: number;
  input: (time: number) => Input;
  /** Lazer mods with settings, written to <name>.mods.json. */
  mods?: LazerMod[];
};

const K1: Key[] = ["K1"];
const K2: Key[] = ["K2"];

// Circles the playfield centre `turns` times between startTime and endTime.
const spin = (time: number, startTime: number, endTime: number, turns: number): Input => {
  const progress = Math.min(1, Math.max(0, (time - startTime) / (endTime - startTime)));
  const angle = progress * turns * 2 * Math.PI;
  return {
    x: 256 + 80 * Math.cos(angle),
    y: 192 + 80 * Math.sin(angle),
    keys: time >= startTime - 50 && time <= endTime ? K1 : [],
  };
};

// A single centred circle (unchanged by HR's flip) clicked `offset` ms after it.
const centreClick = (offset: number) => ({
  hitObjects: ["256,192,1000,1,0"],
  endTime: 2000,
  input: (t: number): Input => ({
    x: 256,
    y: 192,
    keys: t >= 1000 + offset && t < 1020 + offset ? K1 : [],
  }),
});

// A 2s spinner at OD5 (5 spins required), spun `turns` times.
const spinner = (turns: number) => ({
  hitObjects: ["256,192,1000,12,0,3000"],
  endTime: 3500,
  input: (t: number) => spin(t, 1000, 3000, turns),
});

const along = (time: number, startTime: number, fromX: number, length: number) =>
  fromX + Math.min(length, Math.max(0, (time - startTime) / 5));

export const scenarios: Scenario[] = [
  {
    name: "independent-objects",
    description:
      "Circle 1 is skipped. Slider 2 is hit on time and followed. Circle 3 is hit 55ms early while slider 2 is still running. Slider 4 is clicked 500ms early, then on time.",
    hitObjects: [
      "100,100,1000,1,0",
      "300,100,1250,2,0,L|400:100,1,100",
      "100,300,1800,1,0",
      "300,300,3000,2,0,L|400:300,1,100",
    ],
    endTime: 4000,
    input: (t) => {
      if (t < 1250) return { x: 300, y: 100 };
      if (t < 1740) return { x: along(t, 1250, 300, 100), y: 100, keys: K1 };
      if (t < 1800) return { x: 100, y: 300, keys: t >= 1745 ? K2 : [] };
      if (t < 2500) return { x: 300, y: 300 };
      if (t < 2520) return { x: 300, y: 300, keys: K1 };
      if (t < 3000) return { x: 300, y: 300 };
      if (t <= 3500) return { x: along(t, 3000, 300, 100), y: 300, keys: K1 };
      return { x: 400, y: 300 };
    },
  },
  {
    name: "unclicked-circle",
    description: "A single circle that is never clicked.",
    hitObjects: ["100,100,1000,1,0"],
    endTime: 2000,
    input: () => ({ x: 400, y: 300 }),
  },
  {
    name: "note-lock-blocked",
    description:
      "Circle 2 is clicked 10ms before circle 1's start time, while circle 1 is unjudged. No other clicks.",
    hitObjects: ["100,100,1000,1,0", "300,100,1100,1,0"],
    endTime: 2000,
    input: (t) => ({ x: 300, y: 100, keys: t >= 990 && t < 1000 ? K1 : [] }),
  },
  {
    name: "note-lock-released",
    description:
      "Circle 2 is clicked 10ms after circle 1's start time, while circle 1 is unjudged.",
    hitObjects: ["100,100,1000,1,0", "300,100,1100,1,0"],
    endTime: 2000,
    input: (t) => ({ x: 300, y: 100, keys: t >= 1010 && t < 1030 ? K1 : [] }),
  },
  {
    name: "late-click-on-stack",
    description:
      "Two stacked circles 100ms apart. The only click is 160ms after the first circle, past its Meh window.",
    hitObjects: ["200,200,1000,1,0", "200,200,1100,1,0"],
    endTime: 2000,
    input: (t) => ({ x: 200, y: 200, keys: t >= 1160 && t < 1180 ? K1 : [] }),
  },
  {
    name: "both-keys-one-frame",
    description: "Two stacked circles 10ms apart, hit by pressing both keys in the same frame.",
    hitObjects: ["200,200,1000,1,0", "200,200,1010,1,0"],
    endTime: 2000,
    input: (t) => ({ x: 200, y: 200, keys: t >= 1010 && t < 1030 ? [...K1, ...K2] : [] }),
  },
  {
    name: "stacked-circle-offset",
    description:
      "A stack of six circles. The first is clicked at a point 20px up and left of its stacked position, which is outside its unstacked position.",
    hitObjects: [1000, 1100, 1200, 1300, 1400, 1500].map((t) => `200,200,${t},1,0`),
    endTime: 2500,
    // Stack height 5 at CS4 moves the first circle by 5 * 6.4 * 0.57 = 18.24px per axis.
    input: (t) => ({
      x: 200 - 18.24 - 20,
      y: 200 - 18.24 - 20,
      keys: t >= 1000 && t < 1020 ? K1 : [],
    }),
  },
  {
    name: "slider-tail-miss",
    description:
      "A 200px slider (one tick) followed by a circle. The key is released 100ms before the slider ends.",
    hitObjects: ["300,100,1000,2,0,L|500:100,1,200", "100,300,2500,1,0"],
    endTime: 3000,
    input: (t) => {
      if (t < 1000) return { x: 300, y: 100 };
      if (t <= 2000) return { x: along(t, 1000, 300, 200), y: 100, keys: t < 1900 ? K1 : [] };
      return { x: 100, y: 300, keys: t >= 2500 && t < 2520 ? K1 : [] };
    },
  },
  {
    name: "slider-tick-miss",
    description:
      "A 200px slider (one tick) followed by a circle. The key is released 200ms into the slider, before the tick.",
    hitObjects: ["300,100,1000,2,0,L|500:100,1,200", "100,300,2500,1,0"],
    endTime: 3000,
    input: (t) => {
      if (t < 1000) return { x: 300, y: 100 };
      if (t <= 2000) return { x: along(t, 1000, 300, 200), y: 100, keys: t < 1200 ? K1 : [] };
      return { x: 100, y: 300, keys: t >= 2500 && t < 2520 ? K1 : [] };
    },
  },
  {
    name: "hr-flip",
    description:
      "HR. A circle at (100, 100) and a slider along y = 300, hit and followed at their flipped positions (y = 284 and y = 84).",
    hitObjects: ["100,100,1000,1,0", "300,300,1500,2,0,L|400:300,1,100"],
    endTime: 2500,
    mods: [{ acronym: "HR" }],
    input: (t) => {
      if (t < 1500) return { x: 100, y: 284, keys: t >= 1000 && t < 1020 ? K1 : [] };
      return { x: along(t, 1500, 300, 100), y: 84, keys: t <= 2000 ? K1 : [] };
    },
  },
  {
    name: "hr-hit-window",
    description:
      "HR raises OD5 to 7. A centred circle clicked 45ms late: a Great at OD5, but outside OD7's Great window.",
    mods: [{ acronym: "HR" }],
    ...centreClick(45),
  },
  {
    name: "ez-hit-window",
    description:
      "EZ lowers OD5 to 2.5. A centred circle clicked 60ms late: an Ok at OD5, but inside OD2.5's Great window.",
    mods: [{ acronym: "EZ" }],
    ...centreClick(60),
  },
  {
    name: "da-overall-difficulty",
    description: "Difficulty Adjust sets OD10. A centred circle clicked 25ms late.",
    mods: [{ acronym: "DA", settings: { overall_difficulty: 10 } }],
    ...centreClick(25),
  },
  {
    name: "hd-hit",
    description: "HD. A centred circle clicked on time, for the score multiplier.",
    mods: [{ acronym: "HD" }],
    ...centreClick(0),
  },
  {
    name: "nomod-spinner",
    description: "A 2s spinner (5 spins required) spun 4 times, without mods.",
    ...spinner(4),
  },
  {
    name: "dt-spinner",
    description: "DT. The same spinner spun 4 times in map time, which lazer counts as 6.",
    mods: [{ acronym: "DT" }],
    ...spinner(4),
  },
  {
    name: "ht-spinner",
    description: "HT. The same spinner spun 6.4 times in map time, which lazer counts as 4.8.",
    mods: [{ acronym: "HT" }],
    ...spinner(6.4),
  },
  {
    name: "dt-custom-rate-spinner",
    description: "DT at 1.2x. The same spinner spun 4.4 times in map time.",
    mods: [{ acronym: "DT", settings: { speed_change: 1.2 } }],
    ...spinner(4.4),
  },
];

export const beatmapFor = (scenario: Scenario) => `osu file format v14

[General]
AudioFilename: audio.mp3
AudioLeadIn: 0
StackLeniency: 0.7
Mode: 0

[Metadata]
Title:${scenario.name}
TitleUnicode:${scenario.name}
Artist:osu-observer
ArtistUnicode:osu-observer
Creator:osu-observer
Version:${scenario.name}
Source:
Tags:
BeatmapID:0
BeatmapSetID:-1

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:5
ApproachRate:5
SliderMultiplier:1
SliderTickRate:1

[Events]

[TimingPoints]
0,500,4,2,0,100,1,0

[HitObjects]
${scenario.hitObjects.join("\n")}
`;
