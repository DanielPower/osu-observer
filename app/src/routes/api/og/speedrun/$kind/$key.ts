import { createFileRoute } from "@tanstack/react-router";
import { isSpeedrunKind, parseSpeedrunKey } from "../../../../../lib/speedrun-periods";

export const Route = createFileRoute("/api/og/speedrun/$kind/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!isSpeedrunKind(params.kind)) return new Response("Not found", { status: 404 });
        const startsAt = parseSpeedrunKey(params.kind, params.key);
        if (!startsAt || startsAt.getTime() > Date.now()) {
          return new Response("Not found", { status: 404 });
        }
        const { speedrunCardPng } = await import("../../../../../lib/og-cards");
        const { live, png } = await speedrunCardPng(params.kind, startsAt);
        return new Response(png, {
          headers: {
            "Content-Type": "image/png",
            // Live standings change, so a cached card shouldn't outlive them by much.
            "Cache-Control": `public, max-age=${live ? 300 : 86400}`,
          },
        });
      },
    },
  },
});
