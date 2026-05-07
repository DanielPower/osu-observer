import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { createHash } from "node:crypto";
import { db } from "../db/index.js";
import { scoreView } from "../db/schema.js";
import { getScore, getBeatmap, getUser } from "../lib/osu-api.js";
import { getSession } from "./auth.js";

const score = new Hono();

score.get("/:scoreId", async (c) => {
  const { scoreId } = c.req.param();

  const score = await getScore(scoreId);
  if (!score) {
    return c.json(
      {
        error:
          "Score not found. Note that osu! only stores the top 1000 scores on Ranked, Loved, and Qualified maps",
      },
      404,
    );
  }

  const beatmap = await getBeatmap(score.beatmapMd5);
  const player = await getUser(score.userId);

  return c.json({
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
});

function hashIp(ip: string): string {
  const secret = process.env.COOKIE_SECRET ?? "";
  return createHash("sha256")
    .update(`${secret}:${ip}`)
    .digest("hex")
    .slice(0, 32);
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
    .insert(scoreView)
    .values({ scoreId, viewerKey, day: today })
    .onConflictDoNothing();

  return c.json({ ok: true });
});

export default score;
