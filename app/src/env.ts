function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const DATABASE_URL = requireEnv("DATABASE_URL");
export const COOKIE_SECRET = requireEnv("COOKIE_SECRET");
export const OSU_CLIENT_ID = requireEnv("OSU_CLIENT_ID");
export const OSU_CLIENT_SECRET = requireEnv("OSU_CLIENT_SECRET");
export const AUTH_REDIRECT_URI = requireEnv("AUTH_REDIRECT_URI");
export const FRONTEND_URL = requireEnv("FRONTEND_URL");
export const SAVE_MEDIA_PATH = requireEnv("SAVE_MEDIA_PATH");
