import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { db } from "../../../db/index";
import { beatmapInfo, feedScore, user } from "../../../db/schema";

export const Route = createFileRoute("/api/scores/latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "10"), 1), 50);

        const scores = await db
          .select({
            id: feedScore.id,
            rank: feedScore.rank,
            accuracy: feedScore.accuracy,
            pp: feedScore.pp,
            endedAt: feedScore.endedAt,
            username: user.username,
            userAvatarUrl: user.avatarUrl,
            beatmapSetId: beatmapInfo.beatmapSetId,
            title: beatmapInfo.title,
            artist: beatmapInfo.artist,
            version: beatmapInfo.version,
            creator: beatmapInfo.creator,
          })
          .from(feedScore)
          .innerJoin(user, eq(feedScore.userId, user.id))
          .innerJoin(beatmapInfo, eq(feedScore.beatmapId, beatmapInfo.id))
          .where(eq(feedScore.hasReplay, true))
          .orderBy(desc(feedScore.id))
          .limit(limit);

        return Response.json(scores.map(({ id, ...s }) => ({ scoreId: String(id), ...s })));
      },
    },
  },
});
