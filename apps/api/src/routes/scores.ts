import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { sql, gte, desc, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { scoreMetadata, scoreViews } from "../db/schema.js";
import { getSession } from "./auth.js";

const router = new Hono();

router.get("/trending", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days") ?? "7"), 1), 30);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "10"), 1), 50);

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceDate = since.toISOString().slice(0, 10);

  const ranking = await db
    .select({
      scoreId: scoreViews.scoreId,
      viewCount: sql<number>`count(*)::int`.as("view_count"),
    })
    .from(scoreViews)
    .where(gte(scoreViews.day, sinceDate))
    .groupBy(scoreViews.scoreId)
    .orderBy(desc(sql`view_count`))
    .limit(limit);

  if (ranking.length === 0) return c.json([]);

  const scoreIds = ranking.map((r) => r.scoreId);
  const meta = await db
    .select()
    .from(scoreMetadata)
    .where(inArray(scoreMetadata.scoreId, scoreIds));

  const metaById = new Map(meta.map((m) => [m.scoreId, m]));

  return c.json(
    ranking
      .map((r) => {
        const m = metaById.get(r.scoreId);
        if (!m) return null;
        return {
          scoreId: m.scoreId,
          username: m.username,
          beatmapSetId: m.beatmapSetId,
          title: m.title,
          artist: m.artist,
          version: m.version,
          creator: m.creator,
          viewCount: r.viewCount,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );
});

router.get("/me/recent", async (c) => {
  const session = await getSession(getCookie(c, "session"));
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "10"), 1), 50);
  const includeFails = c.req.query("include_fails") === "1" ? "1" : "0";

  const url = new URL(
    `https://osu.ppy.sh/api/v2/users/${session.user_id}/scores/recent`,
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("include_fails", includeFails);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `osu! /users/${session.user_id}/scores/recent failed (${res.status}):`,
      body,
    );
    return c.json(
      { error: `Failed to fetch recent scores (${res.status})` },
      500,
    );
  }

  const scores = (await res.json()) as Array<{
    id: number;
    legacy_score_id?: number | null;
    replay: boolean;
    has_replay?: boolean;
    accuracy: number;
    rank: string;
    pp: number | null;
    user: { id: number; username: string; avatar_url: string };
    beatmap: { id: number; version: string };
    beatmapset: {
      id: number;
      title: string;
      artist: string;
      creator: string;
      covers: Record<string, string>;
    };
  }>;

  return c.json(
    scores.map((s) => ({
      scoreId: String(s.legacy_score_id ?? s.id),
      replayAvailable: s.replay ?? s.has_replay ?? false,
      rank: s.rank,
      accuracy: s.accuracy,
      pp: s.pp,
      user: {
        id: s.user.id,
        username: s.user.username,
        avatarUrl: s.user.avatar_url,
      },
      beatmapSetId: s.beatmapset.id,
      title: s.beatmapset.title,
      artist: s.beatmapset.artist,
      version: s.beatmap.version,
      creator: s.beatmapset.creator,
      coverList: s.beatmapset.covers["list@2x"] ?? s.beatmapset.covers.list,
    })),
  );
});

export default router;
