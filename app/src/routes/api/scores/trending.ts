import { createFileRoute } from "@tanstack/react-router";
import { sql, eq, gte, desc, inArray } from "drizzle-orm";
import { db } from "../../../db/index";
import { beatmap, score, scoreView, user } from "../../../db/schema";

export const Route = createFileRoute("/api/scores/trending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const days = Math.min(
          Math.max(Number(url.searchParams.get("days") ?? "7"), 1),
          30,
        );
        const limit = Math.min(
          Math.max(Number(url.searchParams.get("limit") ?? "10"), 1),
          50,
        );

        const since = new Date();
        since.setDate(since.getDate() - (days - 1));
        const sinceDate = since.toISOString().slice(0, 10);

        const ranking = await db
          .select({
            scoreId: scoreView.scoreId,
            viewCount: sql<number>`count(*)::int`.as("view_count"),
          })
          .from(scoreView)
          .where(gte(scoreView.day, sinceDate))
          .groupBy(scoreView.scoreId)
          .orderBy(desc(sql`view_count`))
          .limit(limit);

        if (ranking.length === 0) return Response.json([]);

        const scoreIds = ranking.map((r) => r.scoreId);
        const meta = await db
          .select({
            scoreId: score.id,
            username: user.username,
            userAvatarUrl: user.avatarUrl,
            beatmapSetId: beatmap.beatmapSetId,
            title: beatmap.title,
            artist: beatmap.artist,
            version: beatmap.version,
            creator: beatmap.creator,
          })
          .from(score)
          .leftJoin(user, eq(score.userId, user.id))
          .innerJoin(beatmap, eq(score.beatmapMd5, beatmap.md5))
          .where(inArray(score.id, scoreIds));

        const metaById = new Map(meta.map((m) => [m.scoreId, m]));

        return Response.json(
          ranking
            .map((r) => {
              const m = metaById.get(r.scoreId);
              if (!m) return null;
              return {
                scoreId: m.scoreId,
                username: m.username,
                userAvatarUrl: m.userAvatarUrl ?? undefined,
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
      },
    },
  },
});
