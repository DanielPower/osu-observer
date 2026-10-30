import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "../../../../lib/auth";
import { isSpeedrunKind, parseSpeedrunKey } from "../../../../lib/speedrun-periods";
import { speedrunPage } from "../../../../lib/speedrun-standings";

export const Route = createFileRoute("/api/speedruns/$kind/$key")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isSpeedrunKind(params.kind)) return new Response("Not found", { status: 404 });
        const startsAt = parseSpeedrunKey(params.kind, params.key);
        if (!startsAt || startsAt.getTime() > Date.now()) {
          return new Response("Not found", { status: 404 });
        }

        const url = new URL(request.url);
        const offset = Math.max(Math.trunc(Number(url.searchParams.get("offset"))) || 0, 0);
        const limit = Math.min(
          Math.max(Math.trunc(Number(url.searchParams.get("limit"))) || 50, 1),
          100,
        );
        const match = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)session=([^;]*)/);
        const session = await getSession(match ? decodeURIComponent(match[1]!) : undefined);

        return Response.json(
          await speedrunPage(params.kind, startsAt, {
            offset,
            limit,
            viewerId: session?.user_id ?? null,
          }),
        );
      },
    },
  },
});
