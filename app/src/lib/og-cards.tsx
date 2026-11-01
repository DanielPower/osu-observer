import { eq } from "drizzle-orm";
import { db } from "../db";
import { beatmap as beatmapTable, score as scoreTable, user as userTable } from "../db/schema";
import { mediaContentType, readMediaObject } from "./media-storage";
import { scoreLazerMods } from "./osu-api";
import { formatPp, SPEEDRUN_KIND_LABELS, speedrunTitle } from "./speedrun-labels";
import type { SpeedrunKind } from "./speedrun-periods";
import { speedrunPage } from "./speedrun-standings";
import {
  fetchImage,
  imageDataUrl,
  renderPng,
  ScoreCardImage,
  SiteCardImage,
  SpeedrunCardImage,
} from "./og-image";

async function beatmapBackground(beatmapSetId: number, bgFilename: string | null) {
  if (!bgFilename) return null;
  const key = `beatmaps/${beatmapSetId}/${bgFilename}`;
  const contentType = mediaContentType(key);
  if (!contentType.startsWith("image/")) return null;
  const bytes = await readMediaObject(key).catch(() => null);
  return bytes && imageDataUrl(bytes, contentType);
}

// Only stored scores get a card: the score page stores a score before Discord asks for its image.
export async function scoreCardPng(scoreId: string) {
  const [row] = await db
    .select({ score: scoreTable, beatmap: beatmapTable, user: userTable })
    .from(scoreTable)
    .innerJoin(beatmapTable, eq(beatmapTable.md5, scoreTable.beatmapMd5))
    .innerJoin(userTable, eq(userTable.id, scoreTable.userId))
    .where(eq(scoreTable.id, scoreId));
  if (!row) return null;
  const { score, beatmap, user } = row;
  const [background, avatar] = await Promise.all([
    beatmapBackground(beatmap.beatmapSetId, beatmap.bgFilename),
    fetchImage(user.avatarUrl),
  ]);
  return renderPng(
    <ScoreCardImage
      card={{
        username: user.username,
        avatar,
        beatmap,
        background,
        accentColor: beatmap.bgColor,
        stats: score,
        mods: scoreLazerMods(score).map((mod) => mod.acronym),
      }}
    />,
  );
}

export async function speedrunCardPng(kind: SpeedrunKind, startsAt: Date) {
  const page = await speedrunPage(kind, startsAt, { offset: 0, limit: 3, viewerId: null });
  const avatars = await Promise.all(page.standings.map((s) => fetchImage(s.avatarUrl)));
  return {
    live: page.live,
    png: await renderPng(
      <SpeedrunCardImage
        card={{
          kindLabel: SPEEDRUN_KIND_LABELS[kind],
          title: speedrunTitle(kind, page.key, new Date(page.startsAt), new Date(page.endsAt)),
          live: page.live,
          playerCount: page.playerCount,
          standings: page.standings.map((standing, i) => ({
            rank: standing.rank,
            username: standing.username,
            avatar: avatars[i] ?? null,
            totalPp: formatPp(standing.totalPp),
          })),
        }}
      />,
    ),
  };
}

let siteCard: ReturnType<typeof renderPng> | null = null;
export function siteCardPng() {
  siteCard ??= renderPng(<SiteCardImage />);
  return siteCard;
}
