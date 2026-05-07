import { defineHandler, deleteCookie } from "h3";

export default defineHandler((event) => {
  deleteCookie(event, "session", { path: "/" });
  return { ok: true };
});
