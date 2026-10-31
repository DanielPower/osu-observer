import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { DATABASE_POOL_MAX, DATABASE_URL } from "../env";

// The server plugins and the SSR routes are bundled separately, so this module runs once per
// bundle. Keep one connection pool per process so the app stays inside the role's connection limit.
const shared = globalThis as typeof globalThis & { observerDbClient?: postgres.Sql };
const client = (shared.observerDbClient ??= postgres(DATABASE_URL, {
  max: DATABASE_POOL_MAX,
  onnotice: () => {},
}));
export const db = drizzle(client, { schema });
