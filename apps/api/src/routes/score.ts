import { Hono } from "hono";
import { getScore, getBeatmapFromHash } from "../lib/osu-api.js";

const score = new Hono();

score.get("/:scoreId", async (c) => {
  const { scoreId } = c.req.param();

  let parsedScore;
  try {
    parsedScore = await getScore(scoreId);
  } catch (e) {
    console.error(e);
    return c.json(
      {
        error:
          "Score not found. Note that osu! only stores the top 1000 scores on Ranked, Loved, and Qualified maps",
      },
      404
    );
  }

  let beatmap;
  try {
    beatmap = await getBeatmapFromHash(parsedScore.info.beatmapHashMD5);
  } catch (e) {
    console.error(e);
    return c.json({ error: "Failed to fetch beatmap data" }, 500);
  }

  return c.json({
    scoreId,
    username: parsedScore.info.username,
    beatmapId: parsedScore.info.beatmapId,
    beatmap: {
      id: beatmap.id,
      beatmapSetId: beatmap.beatmapset_id,
      title: beatmap.beatmapset.title,
      artist: beatmap.beatmapset.artist,
      creator: beatmap.beatmapset.creator,
      version: beatmap.version,
    },
  });
});

export default score;
