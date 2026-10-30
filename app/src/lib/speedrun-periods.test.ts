import { describe, expect, it } from "vitest";
import {
  parseSpeedrunKey,
  previousSpeedrunStart,
  speedrunKey,
  speedrunWindow,
} from "./speedrun-periods";

const utc = (iso: string) => new Date(`${iso}Z`);

describe("speedrunWindow", () => {
  it("starts monthly speedruns on the first of the UTC month", () => {
    const { startsAt, endsAt } = speedrunWindow("monthly", utc("2026-12-31T23:59:59"));
    expect(startsAt).toEqual(utc("2026-12-01T00:00:00"));
    expect(endsAt).toEqual(utc("2027-01-01T00:00:00"));
    expect(speedrunWindow("monthly", utc("2028-02-29T12:00:00")).endsAt).toEqual(
      utc("2028-03-01T00:00:00"),
    );
  });

  it("starts daily speedruns at midnight UTC", () => {
    const { startsAt, endsAt } = speedrunWindow("daily", utc("2026-10-30T23:59:59"));
    expect(startsAt).toEqual(utc("2026-10-30T00:00:00"));
    expect(endsAt).toEqual(utc("2026-10-31T00:00:00"));
  });

  it("starts weekly speedruns on Monday", () => {
    expect(speedrunWindow("weekly", utc("2026-11-01T23:59:59")).startsAt).toEqual(
      utc("2026-10-26T00:00:00"),
    );
    expect(speedrunWindow("weekly", utc("2026-11-02T00:00:00")).startsAt).toEqual(
      utc("2026-11-02T00:00:00"),
    );
    expect(speedrunWindow("weekly", utc("2026-10-26T00:00:00")).endsAt).toEqual(
      utc("2026-11-02T00:00:00"),
    );
  });

  it("puts a score ending exactly on a boundary in the next speedrun", () => {
    expect(speedrunWindow("daily", utc("2026-10-31T00:00:00")).startsAt).toEqual(
      utc("2026-10-31T00:00:00"),
    );
  });
});

describe("speedrunKey", () => {
  it("names each kind", () => {
    expect(speedrunKey("monthly", utc("2026-10-01T00:00:00"))).toBe("2026-10");
    expect(speedrunKey("daily", utc("2026-10-30T00:00:00"))).toBe("2026-10-30");
    expect(speedrunKey("weekly", utc("2026-10-26T00:00:00"))).toBe("2026-W44");
  });

  it("uses ISO week years around the new year", () => {
    expect(speedrunKey("weekly", utc("2026-12-28T00:00:00"))).toBe("2026-W53");
    expect(speedrunKey("weekly", utc("2027-01-04T00:00:00"))).toBe("2027-W01");
    expect(speedrunKey("weekly", utc("2024-12-30T00:00:00"))).toBe("2025-W01");
  });

  it("round trips through parseSpeedrunKey", () => {
    for (const kind of ["daily", "weekly", "monthly"] as const) {
      let startsAt = speedrunWindow(kind, utc("2027-01-10T12:00:00")).startsAt;
      for (let i = 0; i < 60; i++) {
        expect(parseSpeedrunKey(kind, speedrunKey(kind, startsAt))).toEqual(startsAt);
        startsAt = previousSpeedrunStart(kind, startsAt);
      }
    }
  });
});

describe("parseSpeedrunKey", () => {
  it("rejects malformed and out of range keys", () => {
    expect(parseSpeedrunKey("daily", "2026-02-30")).toBeNull();
    expect(parseSpeedrunKey("monthly", "2026-13")).toBeNull();
    expect(parseSpeedrunKey("monthly", "2026-10-01")).toBeNull();
    expect(parseSpeedrunKey("weekly", "2025-W53")).toBeNull();
    expect(parseSpeedrunKey("weekly", "2026-10-26")).toBeNull();
    expect(parseSpeedrunKey("daily", "2026-10")).toBeNull();
  });
});
