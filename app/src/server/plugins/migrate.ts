import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";
import { db } from "../../db";

export default async () => {
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  console.log("Migrations applied");
};
