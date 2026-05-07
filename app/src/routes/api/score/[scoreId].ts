import { defineHandler, getRouterParam, setResponseStatus } from "h3";
import { getScore, getBeatmap, getUser } from "../../../lib/osu-api";

export default defineHandler(async (event) => {
  const scoreId = getRouterParam(event, "scoreId")!;

  try {
    const score = await getScore(scoreId);
    if (!score) {
      setResponseStatus(event, 404);
      return {
        error:
          "Score not found. Note that osu! only stores the top 1000 scores on Ranked, Loved, and Qualified maps",
      };
    }

    const beatmap = await getBeatmap(score.beatmapMd5);
    const player = await getUser(score.userId);

    return {
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
    };
  } catch (err) {
    console.error(`[GET /api/score/${scoreId}]`, err);
    setResponseStatus(event, 500);
    return { error: "Internal Server Error" };
  }
});
