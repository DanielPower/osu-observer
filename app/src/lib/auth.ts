import { jwtVerify } from "jose";

export interface SessionPayload {
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
