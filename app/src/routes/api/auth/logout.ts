import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => {
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/",
          },
        });
      },
    },
  },
});
