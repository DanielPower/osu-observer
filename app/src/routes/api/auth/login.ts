import { defineHandler, setCookie, redirect } from "h3";

const OSU_AUTHORIZE_URL = "https://osu.ppy.sh/oauth/authorize";

export default defineHandler(async (event) => {
  const clientId = process.env.OSU_CLIENT_ID;
  const redirectUri = process.env.AUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return { error: "OAuth not configured" };
  }

  const state = crypto.randomUUID();
  setCookie(event, "oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify public",
    state,
  });

  return redirect(`${OSU_AUTHORIZE_URL}?${params}`, 302);
});
