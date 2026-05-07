import { defineHandler, getRouterParam, getCookie, getRequestIP } from "h3";
import { createHash } from "node:crypto";
import { db } from "../../../../db/index";
import { scoreView } from "../../../../db/schema";
import { getSession } from "../../../../lib/auth";

function hashIp(ip: string): string {
  const secret = process.env.COOKIE_SECRET ?? "";
  return createHash("sha256")
    .update(`${secret}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

export default defineHandler(async (event) => {
  const scoreId = getRouterParam(event, "scoreId")!;

  const session = await getSession(getCookie(event, "session"));
  const ip =
    getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  const viewerKey = session ? `u:${session.user_id}` : `ip:${hashIp(ip)}`;

  const today = new Date().toISOString().slice(0, 10);

  await db
    .insert(scoreView)
    .values({ scoreId, viewerKey, day: today })
    .onConflictDoNothing();

  return { ok: true };
});
