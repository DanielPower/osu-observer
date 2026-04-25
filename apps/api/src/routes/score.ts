import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { createHash } from "node:crypto";
import { db } from "../db/index.js";
import { scoreMetadata, scoreViews } from "../db/schema.js";
import { getScore, getBeatmapFromHash } from "../lib/osu-api.js";
import { getSession } from "./auth.js";

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
      404,
    );
  }

  let beatmap;
  try {
    beatmap = await getBeatmapFromHash(parsedScore.info.beatmapHashMD5);
  } catch (e) {
    console.error(e);
    return c.json({ error: "Failed to fetch beatmap data" }, 500);
  }

  const username = parsedScore.info.username;

  await db
    .insert(scoreMetadata)
    .values({
      scoreId,
      username,
      beatmapId: beatmap.id,
      beatmapSetId: beatmap.beatmapset_id,
      title: beatmap.beatmapset.title,
      artist: beatmap.beatmapset.artist,
      creator: beatmap.beatmapset.creator,
      version: beatmap.version,
    })
    .onConflictDoUpdate({
      target: scoreMetadata.scoreId,
      set: {
        username,
        beatmapId: beatmap.id,
        beatmapSetId: beatmap.beatmapset_id,
        title: beatmap.beatmapset.title,
        artist: beatmap.beatmapset.artist,
        creator: beatmap.beatmapset.creator,
        version: beatmap.version,
        updatedAt: new Date(),
      },
    });

  return c.json({
    scoreId,
    username,
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

function hashIp(ip: string): string {
  const secret = process.env.COOKIE_SECRET ?? "";
  return createHash("sha256").update(`${secret}:${ip}`).digest("hex").slice(0, 32);
}

function getClientIp(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

score.post("/:scoreId/view", async (c) => {
  const { scoreId } = c.req.param();

  const session = await getSession(getCookie(c, "session"));
  const viewerKey = session
    ? `u:${session.user_id}`
    : `ip:${hashIp(getClientIp(c))}`;

  const today = new Date().toISOString().slice(0, 10);

  await db
    .insert(scoreViews)
    .values({ scoreId, viewerKey, day: today })
    .onConflictDoNothing();

  return c.json({ ok: true });
});

export default score;
