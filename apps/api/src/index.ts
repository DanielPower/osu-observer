import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { auth } from "osu-api-extended";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import authRoutes from "./routes/auth.js";
import commentsRoutes from "./routes/comments.js";
import { db } from "./db/index.js";
import score from "./routes/score.js";
import scores from "./routes/scores.js";
import { compress } from "hono/compress";

const app = new Hono();

app.use(compress());

app.onError((err, c) => {
  console.error(`[${c.req.method} ${c.req.path}]`, err);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.get("/", (c) => {
  return c.json({ status: "ok" });
});

app.route("/auth", authRoutes);
app.route("/comments", commentsRoutes);
app.route("/score", score);
app.route("/scores", scores);

const mediaPath = process.env.SAVE_MEDIA_PATH;
if (mediaPath) {
  app.use(
    "/media/*",
    serveStatic({
      root: mediaPath,
      rewriteRequestPath: (path) => path.replace(/^\/media/, ""),
    }),
  );
}

const startServer = async () => {
  const required = [
    "SAVE_MEDIA_PATH",
    "OSU_CLIENT_ID",
    "OSU_CLIENT_SECRET",
    "COOKIE_SECRET",
    "AUTH_REDIRECT_URI",
  ] as const;
  for (const key of required) {
    if (!process.env[key]) throw new Error(`${key} must be set`);
  }

  if (process.env.RUN_MIGRATIONS === "true") {
    const migrationsFolder = join(
      dirname(fileURLToPath(import.meta.url)),
      "../drizzle",
    );
    await migrate(db, { migrationsFolder });
    console.log("Database migrations applied");
  }

  await auth.login({
    type: "v2",
    client_id: process.env.OSU_CLIENT_ID!,
    client_secret: process.env.OSU_CLIENT_SECRET!,
    scopes: ["public"],
  });

  console.log("osu! API authenticated");

  serve({ fetch: app.fetch, port: 3001 }, (info) => {
    console.log(`API server running on http://localhost:${info.port}`);
  });
};

startServer();
