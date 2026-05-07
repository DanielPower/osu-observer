import {
  defineHandler,
  getCookie,
  deleteCookie,
  setCookie,
  redirect,
  getQuery,
} from "h3";
import { SignJWT } from "jose";
import { db } from "../../../db/index";
import { user } from "../../../db/schema";

const OSU_TOKEN_URL = "https://osu.ppy.sh/oauth/token";
const OSU_ME_URL = "https://osu.ppy.sh/api/v2/me";

export default defineHandler(async (event) => {
  const frontendUrl = process.env.FRONTEND_URL;
  const clientId = process.env.OSU_CLIENT_ID;
  const clientSecret = process.env.OSU_CLIENT_SECRET;
  const redirectUri = process.env.AUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return { error: "OAuth not configured" };
  }

  const { code, state } = getQuery(event) as { code?: string; state?: string };
  const savedState = getCookie(event, "oauth_state");
  deleteCookie(event, "oauth_state", { path: "/" });

  if (!state || !savedState || state !== savedState) {
    return redirect(`${frontendUrl}?auth_error=invalid_state`, 302);
  }

  if (!code) {
    return redirect(`${frontendUrl}?auth_error=no_code`, 302);
  }

  const tokenRes = await fetch(OSU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return redirect(`${frontendUrl}?auth_error=token_exchange_failed`, 302);
  }

  const { access_token, expires_in } = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
  };

  const meRes = await fetch(OSU_ME_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!meRes.ok) {
    return redirect(`${frontendUrl}?auth_error=user_fetch_failed`, 302);
  }

  const me = (await meRes.json()) as {
    id: number;
    username: string;
    avatar_url: string;
  };

  await db
    .insert(user)
    .values({ id: me.id, username: me.username, avatarUrl: me.avatar_url })
    .onConflictDoUpdate({
      target: user.id,
      set: { username: me.username, avatarUrl: me.avatar_url },
    });

  const secret = process.env.COOKIE_SECRET;
  if (!secret) throw new Error("COOKIE_SECRET must be set");
  const encodedSecret = new TextEncoder().encode(secret);

  const jwt = await new SignJWT({
    access_token,
    user_id: me.id,
    username: me.username,
    avatar_url: me.avatar_url,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${expires_in}s`)
    .sign(encodedSecret);

  setCookie(event, "session", jwt, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: expires_in,
    path: "/",
  });

  return redirect(frontendUrl, 302);
});
