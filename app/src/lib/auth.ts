import { jwtVerify } from "jose";
import { COOKIE_SECRET } from "./env";

export interface SessionPayload {
  access_token: string;
  user_id: number;
  username: string;
  avatar_url: string;
}

const secret = new TextEncoder().encode(COOKIE_SECRET);

export async function getSession(
  cookie: string | undefined,
): Promise<SessionPayload | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
