import { describe, expect, test } from "vitest";
import { scorePreviewDescription, speedrunPreviewDescription } from "./link-preview";

describe("scorePreviewDescription", () => {
  test("summarises the official result", () => {
    expect(
      scorePreviewDescription(
        { totalScore: 1234567, accuracy: 0.98834, pp: 1027.4, maxCombo: 2385, rank: "XH" },
        ["HD", "DT", "CL"],
        "Nakagawa-Kanon",
      ),
    ).toBe(
      "SS · 98.83% · 1,027pp · 2,385x · +HDDT\nMapped by Nakagawa-Kanon. Watch the replay on osu!observer.",
    );
  });

  test("leaves out what a score stored before stats were kept doesn't have", () => {
    expect(
      scorePreviewDescription(
        { totalScore: null, accuracy: null, pp: null, maxCombo: null, rank: null },
        [],
        "peppy",
      ),
    ).toBe("Mapped by peppy. Watch the replay on osu!observer.");
  });
});

describe("speedrunPreviewDescription", () => {
  test("lists the podium", () => {
    expect(
      speedrunPreviewDescription({
        live: false,
        playerCount: 1204,
        standings: [
          { username: "a", totalPp: 1500.25 },
          { username: "b", totalPp: 999 },
        ],
      }),
    ).toBe("Final standings · 1,204 players\n1. a 1,500.3pp\n2. b 999.0pp");
  });

  test("says when nobody has played yet", () => {
    expect(speedrunPreviewDescription({ live: true, playerCount: 0, standings: [] })).toBe(
      "Live · 0 players\nNo plays yet.",
    );
  });
});
