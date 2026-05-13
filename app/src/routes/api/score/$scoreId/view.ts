import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { db } from "../../../../db/index";
import { scoreView } from "../../../../db/schema";
import { getSession } from "../../../../lib/auth";
import { COOKIE_SECRET } from "../../../../env";

function hashIp(ip: string): string {
  return createHash("sha256").update(`${COOKIE_SECRET}:${ip}`).digest("hex").slice(0, 32);
}

export const Route = createFileRoute("/api/score/$scoreId/view")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const match = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)session=([^;]*)/);
        const session = await getSession(match ? decodeURIComponent(match[1]!) : undefined);
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const viewerKey = session ? `u:${session.user_id}` : `ip:${hashIp(ip)}`;
        const today = new Date().toISOString().slice(0, 10);

        await db
          .insert(scoreView)
          .values({ scoreId: params.scoreId, viewerKey, day: today })
          .onConflictDoNothing();

        return Response.json({ ok: true });
      },
    },
  },
});
