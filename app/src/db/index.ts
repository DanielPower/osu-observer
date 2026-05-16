import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { DATABASE_URL } from "../env";

const client = postgres(DATABASE_URL, { onnotice: () => {} });
export const db = drizzle(client, { schema });
