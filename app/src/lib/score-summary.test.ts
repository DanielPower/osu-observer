import { describe, expect, it } from "vitest";
import { gradeFromScore } from "./score-summary";
import { parseScoreInput } from "./score-input";

describe("gradeFromScore", () => {
  it("uses lazer's accuracy cutoffs", () => {
    expect(gradeFromScore(1, 0, [])).toBe("X");
    expect(gradeFromScore(0.95, 0, [])).toBe("S");
    expect(gradeFromScore(0.9499, 0, [])).toBe("A");
    expect(gradeFromScore(0.9, 0, [])).toBe("A");
    expect(gradeFromScore(0.8, 0, [])).toBe("B");
    expect(gradeFromScore(0.7, 0, [])).toBe("C");
    expect(gradeFromScore(0.69, 0, [])).toBe("D");
  });

  it("caps S and SS at A when there is a miss", () => {
    expect(gradeFromScore(0.97, 1, [])).toBe("A");
    expect(gradeFromScore(0.85, 2, [])).toBe("B");
  });

  it("turns S and SS silver under Hidden or Flashlight", () => {
    expect(gradeFromScore(1, 0, ["HD"])).toBe("XH");
    expect(gradeFromScore(0.96, 0, ["FL"])).toBe("SH");
    expect(gradeFromScore(0.92, 0, ["HD"])).toBe("A");
  });
});

describe("parseScoreInput", () => {
  it("accepts bare IDs and score URLs", () => {
    expect(parseScoreInput(" 4727715398 ")).toBe("4727715398");
    expect(parseScoreInput("https://osu.ppy.sh/scores/4727715398")).toBe("4727715398");
    expect(parseScoreInput("osu.ppy.sh/scores/osu/123456")).toBe("123456");
  });

  it("rejects anything else", () => {
    expect(parseScoreInput("https://osu.ppy.sh/beatmapsets/1")).toBeNull();
    expect(parseScoreInput("hello")).toBeNull();
  });
});
