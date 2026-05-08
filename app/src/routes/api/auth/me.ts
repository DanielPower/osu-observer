import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "../../../lib/auth";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const match = (request.headers.get("cookie") ?? "").match(
          /(?:^|;\s*)session=([^;]*)/,
        );
        const session = await getSession(
          match ? decodeURIComponent(match[1]!) : undefined,
        );
        if (!session) return Response.json(null);
        return Response.json({
          user_id: session.user_id,
          username: session.username,
          avatar_url: session.avatar_url,
        });
      },
    },
  },
});
