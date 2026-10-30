// Hand-scripted replays for mechanics the real replay fixtures don't cover.
// `pnpm --filter osu-simulation generate-scenarios` writes each one as a .osu and
// .osr pair under test/data/scenarios, so they can be played back in lazer and the
// results recorded as the expected values.
//
// Maps use OD5 (Great 49.5ms, Ok 99.5ms, Meh 149.5ms), CS4 (radius ~36.5px),
// 120 BPM and SV 1, so a 100px slider lasts 500ms.

export type Key = "K1" | "K2";
export type Input = { x: number; y: number; keys?: Key[] };

export type Scenario = {
  name: string;
  description: string;
  hitObjects: string[];
  endTime: number;
  input: (time: number) => Input;
};

const K1: Key[] = ["K1"];
const K2: Key[] = ["K2"];

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
