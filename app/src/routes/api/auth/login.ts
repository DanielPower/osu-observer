import { defineHandler, setCookie, redirect } from "h3";
import { OSU_CLIENT_ID, AUTH_REDIRECT_URI } from "../../../lib/env";

const OSU_AUTHORIZE_URL = "https://osu.ppy.sh/oauth/authorize";

export default defineHandler(async (event) => {
  const state = crypto.randomUUID();
  setCookie(event, "oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: OSU_CLIENT_ID,
    redirect_uri: AUTH_REDIRECT_URI,
    response_type: "code",
    scope: "identify public",
    state,
  });

  return redirect(`${OSU_AUTHORIZE_URL}?${params}`, 302);
});
