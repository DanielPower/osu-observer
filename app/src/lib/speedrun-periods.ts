export const SPEEDRUN_KINDS = ["daily", "weekly", "monthly"] as const;
export type SpeedrunKind = (typeof SPEEDRUN_KINDS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export const isSpeedrunKind = (value: string): value is SpeedrunKind =>
  (SPEEDRUN_KINDS as readonly string[]).includes(value);

export function speedrunStart(kind: SpeedrunKind, time: Date) {
  if (kind === "monthly") return new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), 1));
  const t = time.getTime();
  const day = t - (t % DAY_MS);
  if (kind === "daily") return new Date(day);
  // getUTCDay is 0 on Sunday; weeks start on Monday like ISO weeks.
  const daysSinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - daysSinceMonday * DAY_MS);
}

export function speedrunEnd(kind: SpeedrunKind, startsAt: Date) {
  if (kind === "monthly") {
    return new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 1));
  }
  return new Date(startsAt.getTime() + (kind === "daily" ? DAY_MS : WEEK_MS));
}

export function speedrunWindow(kind: SpeedrunKind, time: Date) {
  const startsAt = speedrunStart(kind, time);
  return { startsAt, endsAt: speedrunEnd(kind, startsAt) };
}

export function previousSpeedrunStart(kind: SpeedrunKind, startsAt: Date) {
  return speedrunStart(kind, new Date(startsAt.getTime() - 1));
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoWeek(monday: Date) {
  // The ISO week-numbering year is the one containing the week's Thursday.
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;
  return { year, week };
}

export function speedrunKey(kind: SpeedrunKind, startsAt: Date) {
  const month = `${startsAt.getUTCFullYear()}-${pad(startsAt.getUTCMonth() + 1)}`;
  if (kind === "monthly") return month;
  if (kind === "daily") return `${month}-${pad(startsAt.getUTCDate())}`;
  const { year, week } = isoWeek(startsAt);
  return `${year}-W${pad(week)}`;
}

export function parseSpeedrunKey(kind: SpeedrunKind, key: string): Date | null {
  let startsAt: Date;
  if (kind === "weekly") {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    // January 4th is always in ISO week 1.
    const week1 = speedrunStart("weekly", new Date(Date.UTC(year, 0, 4)));
    startsAt = new Date(week1.getTime() + (Number(match[2]) - 1) * WEEK_MS);
  } else {
    const match =
      kind === "monthly" ? /^(\d{4})-(\d{2})$/.exec(key) : /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    const [, y, m, d = "1"] = match;
    startsAt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }
  // Rejects out of range parts such as 2026-02-30 or week 54, which Date silently rolls over.
  return speedrunKey(kind, startsAt) === key ? startsAt : null;
}
