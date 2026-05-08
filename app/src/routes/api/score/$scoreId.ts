import { createFileRoute } from "@tanstack/react-router";
import { getScore, getBeatmap, getUser } from "../../../lib/osu-api";

export const Route = createFileRoute("/api/score/$scoreId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const score = await getScore(params.scoreId);
          if (!score) {
            return Response.json(
              {
                error:
                  "Score not found. Note that osu! only stores the top 1000 scores on Ranked, Loved, and Qualified maps",
              },
              { status: 404 },
            );
          }

          const beatmap = await getBeatmap(score.beatmapMd5);
          const player = await getUser(score.userId);

          return Response.json({
            score: {
              id: score.id,
              simulation: score.simulation,
              mods: score.mods,
            },
            player: {
              id: player.id,
              username: player.username,
              avatarUrl: player.avatarUrl,
            },
            beatmap: {
              md5: beatmap.md5,
              beatmapSetId: beatmap.beatmapSetId,
              title: beatmap.title,
              artist: beatmap.artist,
              creator: beatmap.creator,
              version: beatmap.version,
            },
          });
        } catch (err) {
          console.error(`[GET /api/score/${params.scoreId}]`, err);
          return Response.json(
            { error: "Internal Server Error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
