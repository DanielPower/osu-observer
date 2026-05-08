const missing: string[] = [];

function get(name: string): string {
  const v = process.env[name];
  if (!v) missing.push(name);
  return v ?? "";
}

export const DATABASE_URL = get("DATABASE_URL");
export const COOKIE_SECRET = get("COOKIE_SECRET");
export const SAVE_MEDIA_PATH = get("SAVE_MEDIA_PATH");
export const PUBLIC_SERVE_MEDIA_PATH = get("PUBLIC_SERVE_MEDIA_PATH");
export const OSU_CLIENT_ID = get("OSU_CLIENT_ID");
export const OSU_CLIENT_SECRET = get("OSU_CLIENT_SECRET");
export const AUTH_REDIRECT_URI = get("AUTH_REDIRECT_URI");
export const FRONTEND_URL = get("FRONTEND_URL");

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`,
  );
}
