import { createFileRoute } from "@tanstack/react-router";

const OSU_AUTHORIZE_URL = "https://osu.ppy.sh/oauth/authorize";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      GET: async () => {
        const state = crypto.randomUUID();
        const params = new URLSearchParams({
          client_id: import.meta.env.OSU_CLIENT_ID,
          redirect_uri: import.meta.env.AUTH_REDIRECT_URI,
          response_type: "code",
          scope: "identify public",
          state,
        });
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${OSU_AUTHORIZE_URL}?${params}`,
            "Set-Cookie": `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=300; Path=/`,
          },
        });
      },
    },
  },
});
