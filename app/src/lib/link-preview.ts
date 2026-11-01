import { DEFAULT_ACCENT_COLOR } from "./accentVars";
import { GRADES } from "./grade-colors";
import { formatPp } from "./speedrun-labels";

export const SITE_NAME = "osu!observer";
export const SITE_DESCRIPTION =
  "Watch osu! replays in your browser, see every hit and miss, and follow daily, weekly and monthly pp speedruns.";

export type ScoreStats = {
  totalScore: number | null;
  accuracy: number | null;
  pp: number | null;
  maxCombo: number | null;
  rank: string | null;
};

export const formatAccuracy = (accuracy: number) => `${(accuracy * 100).toFixed(2)}%`;
export const formatInteger = (value: number) => value.toLocaleString("en");

// Mods that say nothing about the play: lazer marks every stable-scored replay CL.
export const visibleMods = (mods: string[]) => mods.filter((mod) => mod !== "CL");

export function scorePreviewTitle(
  username: string,
  beatmap: { artist: string; title: string; version: string },
) {
  return `${username} | ${beatmap.artist} - ${beatmap.title} [${beatmap.version}]`;
}

export function scorePreviewDescription(stats: ScoreStats, mods: string[], creator: string) {
  const parts = [
    stats.rank && (GRADES[stats.rank]?.label ?? stats.rank),
    stats.accuracy !== null && formatAccuracy(stats.accuracy),
    stats.pp !== null && `${formatInteger(Math.round(stats.pp))}pp`,
    stats.maxCombo !== null && `${formatInteger(stats.maxCombo)}x`,
    visibleMods(mods).length > 0 && `+${visibleMods(mods).join("")}`,
  ].filter(Boolean);
  const summary = parts.length > 0 ? `${parts.join(" · ")}\n` : "";
  return `${summary}Mapped by ${creator}. Watch the replay on ${SITE_NAME}.`;
}

export function speedrunPreviewDescription(preview: {
  live: boolean;
  playerCount: number;
  standings: { username: string; totalPp: number }[];
}) {
  const status = `${preview.live ? "Live" : "Final standings"} · ${formatInteger(preview.playerCount)} ${preview.playerCount === 1 ? "player" : "players"}`;
  if (preview.standings.length === 0) return `${status}\nNo plays yet.`;
  const podium = preview.standings
    .map((s, i) => `${i + 1}. ${s.username} ${formatPp(s.totalPp)}pp`)
    .join("\n");
  return `${status}\n${podium}`;
}

type Meta = { title?: string; name?: string; property?: string; content?: string };

// Open Graph and Twitter card tags. Discord reads these from the server-rendered HTML,
// and uses theme-color for the embed's side bar.
export function previewMeta({
  title,
  description,
  url,
  image,
  themeColor,
}: {
  title: string;
  description: string;
  url?: string;
  image: string;
  themeColor?: string | null;
}): Meta[] {
  return [
    { name: "description", content: description },
    { name: "theme-color", content: themeColor ?? DEFAULT_ACCENT_COLOR },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(url ? [{ property: "og:url", content: url }] : []),
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}
