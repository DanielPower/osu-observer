import { createFileRoute } from "@tanstack/react-router";
import { SignJWT } from "jose";
import { db } from "../../../db/index";
import { user } from "../../../db/schema";
import {
  FRONTEND_URL,
  COOKIE_SECRET,
  OSU_CLIENT_ID,
  OSU_CLIENT_SECRET,
  AUTH_REDIRECT_URI,
} from "../../../env";

const OSU_TOKEN_URL = "https://osu.ppy.sh/oauth/token";
const OSU_ME_URL = "https://osu.ppy.sh/api/v2/me";
const encodedSecret = new TextEncoder().encode(COOKIE_SECRET);

export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? undefined;
        const state = url.searchParams.get("state") ?? undefined;

        const cookieHeader = request.headers.get("cookie") ?? "";
        const stateMatch = cookieHeader.match(/(?:^|;\s*)oauth_state=([^;]*)/);
        const savedState = stateMatch ? decodeURIComponent(stateMatch[1]!) : undefined;
        const clearStateCookie = "oauth_state=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/";

        if (!state || !savedState || state !== savedState) {
          return new Response(null, {
            status: 302,
            headers: [
              ["Location", `${FRONTEND_URL}?auth_error=invalid_state`],
              ["Set-Cookie", clearStateCookie],
            ],
          });
        }

        if (!code) {
          return new Response(null, {
            status: 302,
            headers: [
              ["Location", `${FRONTEND_URL}?auth_error=no_code`],
              ["Set-Cookie", clearStateCookie],
            ],
          });
        }

        const tokenRes = await fetch(OSU_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: OSU_CLIENT_ID,
            client_secret: OSU_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: AUTH_REDIRECT_URI,
          }),
        });

        if (!tokenRes.ok) {
          return new Response(null, {
            status: 302,
            headers: [
              ["Location", `${FRONTEND_URL}?auth_error=token_exchange_failed`],
              ["Set-Cookie", clearStateCookie],
            ],
          });
        }

        const { access_token, expires_in } = (await tokenRes.json()) as {
          access_token: string;
          expires_in: number;
        };

        const meRes = await fetch(OSU_ME_URL, {
          headers: { Authorization: `Bearer ${access_token}` },
        });

        if (!meRes.ok) {
          return new Response(null, {
            status: 302,
            headers: [
              ["Location", `${FRONTEND_URL}?auth_error=user_fetch_failed`],
              ["Set-Cookie", clearStateCookie],
            ],
          });
        }

        const me = (await meRes.json()) as {
          id: number;
          username: string;
          avatar_url: string;
        };

        await db
          .insert(user)
          .values({
            id: me.id,
            username: me.username,
            avatarUrl: me.avatar_url,
          })
          .onConflictDoUpdate({
            target: user.id,
            set: { username: me.username, avatarUrl: me.avatar_url },
          });

        const jwt = await new SignJWT({
          access_token,
          user_id: me.id,
          username: me.username,
          avatar_url: me.avatar_url,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime(`${expires_in}s`)
          .sign(encodedSecret);

        return new Response(null, {
          status: 302,
          headers: [
            ["Location", FRONTEND_URL],
            ["Set-Cookie", clearStateCookie],
            [
              "Set-Cookie",
              `session=${encodeURIComponent(jwt)}; HttpOnly; SameSite=Lax; Max-Age=${expires_in}; Path=/`,
            ],
          ],
        });
      },
    },
  },
});
