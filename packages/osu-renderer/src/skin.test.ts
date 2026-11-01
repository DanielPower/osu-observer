import { expect, test } from "vitest";
import {
  DEFAULT_HIT_OBJECT_CONFIG,
  legacySkinVersion,
  parseHitObjectConfig,
  skinFilesToImageUrls,
} from "./skin";

test("prefers an @2x image over the 1x one, whichever comes first", () => {
  expect(
    skinFilesToImageUrls({
      "hitcircle.png": "blob:hitcircle-1x",
      "hitcircle@2x.png": "blob:hitcircle-2x",
      "cursor@2x.png": "blob:cursor-2x",
      "cursor.png": "blob:cursor-1x",
      "hit300.png": "blob:hit300-1x",
      "scorebar-colour-0@2x.png": "blob:colour-0-2x",
      "unused@2x.png": "blob:unused",
    }),
  ).toEqual({
    hitcircle: { url: "blob:hitcircle-2x", density: 2 },
    cursor: { url: "blob:cursor-2x", density: 2 },
    hit300: { url: "blob:hit300-1x", density: 1 },
    "scorebar-colour-0": { url: "blob:colour-0-2x", density: 2 },
  });
});

test("reads the skin version as lazer does", () => {
  expect(legacySkinVersion(null)).toBe(Infinity);
  expect(legacySkinVersion("[General]\nName: x")).toBe(1);
  expect(legacySkinVersion("[General]\nVersion: 2.5")).toBe(2.5);
  expect(legacySkinVersion("[General]\nVersion: latest")).toBe(Infinity);
});

test("reads the hit object settings from the renderer's skin.ini", () => {
  expect(
    parseHitObjectConfig(
      "[General]\nVersion: 2.2\nAllowSliderBallTint: 1\n[Colours]\nSliderBall: 2,170,255\n[Fonts]\nHitCircleOverlap: 3",
    ),
  ).toEqual({
    version: 2.2,
    allowSliderBallTint: true,
    sliderBallColour: 0x02aaff,
    hitCircleOverlap: 3,
  });
  expect(parseHitObjectConfig("[General]\nCursorCentre: 1")).toEqual(DEFAULT_HIT_OBJECT_CONFIG);
});
