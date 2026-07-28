function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireHttpUrl(name: string): string {
  const value = requireEnv(name);
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    throw new Error(`${name} must be an absolute URL beginning with http:// or https://`);
  }
  return value;
}

export const DATABASE_URL = requireEnv("DATABASE_URL");
export const COOKIE_SECRET = requireEnv("COOKIE_SECRET");
export const OSU_CLIENT_ID = requireEnv("OSU_CLIENT_ID");
export const OSU_CLIENT_SECRET = requireEnv("OSU_CLIENT_SECRET");
export const AUTH_REDIRECT_URI = requireHttpUrl("AUTH_REDIRECT_URI");
export const FRONTEND_URL = requireHttpUrl("FRONTEND_URL");
export const MEDIA_BASE_URL = requireHttpUrl("MEDIA_BASE_URL").replace(/\/+$/, "");
export const S3_ENDPOINT = requireHttpUrl("S3_ENDPOINT");
export const S3_REGION = requireEnv("S3_REGION");
export const S3_BUCKET = requireEnv("S3_BUCKET");
export const S3_ACCESS_KEY_ID = requireEnv("S3_ACCESS_KEY_ID");
export const S3_SECRET_ACCESS_KEY = requireEnv("S3_SECRET_ACCESS_KEY");
export const S3_SESSION_TOKEN = process.env.S3_SESSION_TOKEN;
export const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";
