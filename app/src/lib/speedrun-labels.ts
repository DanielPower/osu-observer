import type { SpeedrunKind } from "./speedrun-periods";

export const SPEEDRUN_KIND_LABELS: Record<SpeedrunKind, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const dayFormat = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  weekday: "long",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const shortDayFormat = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});
const monthFormat = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export function speedrunTitle(kind: SpeedrunKind, key: string, startsAt: Date, endsAt: Date) {
  if (kind === "monthly") return monthFormat.format(startsAt);
  if (kind === "daily") return dayFormat.format(startsAt);
  const lastDay = new Date(endsAt.getTime() - 1);
  return `Week ${Number(key.slice(-2))} · ${shortDayFormat.format(startsAt)} – ${shortDayFormat.format(lastDay)}`;
}

export function formatTimeLeft(ms: number) {
  const total = Math.max(Math.floor(ms / 1000), 0);
  const days = Math.floor(total / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

export const formatPp = (pp: number) =>
  pp.toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
