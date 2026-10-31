import { expect, test } from "vitest";
import { skinFilesToImageUrls } from "./skin";

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
