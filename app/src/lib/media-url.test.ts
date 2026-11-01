import { describe, expect, it } from "vitest";
import { mediaUrl } from "./media-url";

describe("mediaUrl", () => {
  it("encodes characters that would end the path, but keeps folders", () => {
    expect(
      mediaUrl("https://cdn", "beatmaps/2425515/irohaRingo - #Kami o Kiru (Kieost) [Normal].osu"),
    ).toBe(
      "https://cdn/beatmaps/2425515/irohaRingo%20-%20%23Kami%20o%20Kiru%20(Kieost)%20%5BNormal%5D.osu",
    );
    expect(mediaUrl("https://cdn", "beatmaps/1/sb/what?+.jpg")).toBe(
      "https://cdn/beatmaps/1/sb/what%3F%2B.jpg",
    );
  });
});
