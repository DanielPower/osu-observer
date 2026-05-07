import { defineHandler, getCookie } from "h3";
import { getSession } from "../../../lib/auth";

export default defineHandler(async (event) => {
  const session = await getSession(getCookie(event, "session"));
  if (!session) return null;
  return {
    user_id: session.user_id,
    username: session.username,
    avatar_url: session.avatar_url,
  };
});
