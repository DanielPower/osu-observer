import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const OSU_AUTHORIZE_URL = "https://osu.ppy.sh/oauth/authorize";
const OSU_TOKEN_URL = "https://osu.ppy.sh/oauth/token";
const OSU_ME_URL = "https://osu.ppy.sh/api/v2/me";

interface SessionPayload {
  access_token: string;
  user_id: number;
  username: string;
  avatar_url: string;
}

function getSecret() {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) throw new Error("COOKIE_SECRET must be set");
  return new TextEncoder().encode(secret);
}

export async function getSession(
  cookie: string | undefined,
): Promise<SessionPayload | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

const auth = new Hono();

auth.get("/login", (c) => {
  const clientId = process.env.OSU_CLIENT_ID;
  const redirectUri = process.env.AUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return c.json({ error: "OAuth not configured" }, 500);
  }

  const state = crypto.randomUUID();
  setCookie(c, "oauth_state", state, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 300,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });

  return c.redirect(`${OSU_AUTHORIZE_URL}?${params}`);
});

auth.get("/callback", async (c) => {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
  const clientId = process.env.OSU_CLIENT_ID;
  const clientSecret = process.env.OSU_CLIENT_SECRET;
  const redirectUri = process.env.AUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return c.json({ error: "OAuth not configured" }, 500);
  }

  const { code, state } = c.req.query();
  const savedState = getCookie(c, "oauth_state");
  deleteCookie(c, "oauth_state", { path: "/" });

  if (!state || !savedState || state !== savedState) {
    return c.redirect(`${frontendUrl}?auth_error=invalid_state`);
  }

  if (!code) {
    return c.redirect(`${frontendUrl}?auth_error=no_code`);
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
    return c.redirect(`${frontendUrl}?auth_error=token_exchange_failed`);
  }

  const { access_token, expires_in } = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
  };

  const meRes = await fetch(OSU_ME_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!meRes.ok) {
    return c.redirect(`${frontendUrl}?auth_error=user_fetch_failed`);
  }

  const me = (await meRes.json()) as {
    id: number;
    username: string;
    avatar_url: string;
  };

  await db
    .insert(users)
    .values({ id: me.id, username: me.username, avatarUrl: me.avatar_url })
    .onConflictDoUpdate({
      target: users.id,
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
    .sign(getSecret());

  setCookie(c, "session", jwt, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: expires_in,
    path: "/",
    // secure: true, // enable in production
  });

  return c.redirect(frontendUrl);
});

auth.get("/me", async (c) => {
  const session = await getSession(getCookie(c, "session"));
  if (!session) return c.json(null);
  return c.json({
    user_id: session.user_id,
    username: session.username,
    avatar_url: session.avatar_url,
  });
});

auth.post("/logout", (c) => {
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

export default auth;
