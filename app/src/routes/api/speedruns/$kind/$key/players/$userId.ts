import { createFileRoute } from "@tanstack/react-router";
import { isSpeedrunKind, parseSpeedrunKey } from "../../../../../../lib/speedrun-periods";
import { speedrunPlays } from "../../../../../../lib/speedrun-standings";

export const Route = createFileRoute("/api/speedruns/$kind/$key/players/$userId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { kind } = params;
        const userId = Number(params.userId);
        if (!isSpeedrunKind(kind) || !Number.isInteger(userId)) {
          return new Response("Not found", { status: 404 });
        }
        const startsAt = parseSpeedrunKey(kind, params.key);
        if (!startsAt) return new Response("Not found", { status: 404 });
        // Past speedruns only keep their top 10 players' plays.
        const plays = await speedrunPlays(kind, startsAt, userId);
        if (!plays) return new Response("Not found", { status: 404 });
        return Response.json(plays);
      },
    },
  },
});
