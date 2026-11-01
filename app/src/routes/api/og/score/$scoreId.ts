import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/og/score/$scoreId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { scoreCardPng } = await import("../../../../lib/og-cards");
        const png = await scoreCardPng(params.scoreId);
        if (!png) return new Response("Not found", { status: 404 });
        return new Response(png, {
          headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});
