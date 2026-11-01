import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/og/site")({
  server: {
    handlers: {
      GET: async () => {
        const { siteCardPng } = await import("../../../lib/og-cards");
        return new Response(await siteCardPng(), {
          headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});
