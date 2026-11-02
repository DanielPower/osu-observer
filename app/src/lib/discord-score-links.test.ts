import { describe, expect, test } from "vitest";
import { findScoreIds } from "./discord-score-links";

describe("findScoreIds", () => {
  test("finds score links in a message", () => {
    expect(findScoreIds("look at this https://osu.ppy.sh/scores/4727715398 !!")).toEqual([
      "4727715398",
    ]);
  });

  test("finds links Discord wouldn't embed and links with a query or fragment", () => {
    expect(
      findScoreIds(
        "<https://osu.ppy.sh/scores/1> https://osu.ppy.sh/scores/2?mode=osu http://osu.ppy.sh/scores/3#x",
      ),
    ).toEqual(["1", "2", "3"]);
  });

  test("ignores legacy stable score links and other pages", () => {
    expect(
      findScoreIds(
        "https://osu.ppy.sh/scores/osu/123 https://osu.ppy.sh/beatmaps/123 https://example.com/scores/5",
      ),
    ).toEqual([]);
  });

  test("ignores a link whose ID runs into more path", () => {
    expect(findScoreIds("https://osu.ppy.sh/scores/123/download")).toEqual([]);
  });

  test("lists each score once and at most five", () => {
    const links = [1, 1, 2, 3, 4, 5, 6].map((id) => `https://osu.ppy.sh/scores/${id}`).join(" ");
    expect(findScoreIds(links)).toEqual(["1", "2", "3", "4", "5"]);
  });
});
