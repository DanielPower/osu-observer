import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { auth } from "osu-api-extended";
import authRoutes from "./routes/auth.js";
import commentsRoutes from "./routes/comments.js";
import score from "./routes/score.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ status: "ok" });
});

app.route("/auth", authRoutes);
app.route("/comments", commentsRoutes);
app.route("/score", score);

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
    "OSU_USERNAME",
    "OSU_PASSWORD",
    "SAVE_MEDIA_PATH",
    "OSU_CLIENT_ID",
    "OSU_CLIENT_SECRET",
    "COOKIE_SECRET",
    "AUTH_REDIRECT_URI",
  ] as const;
  for (const key of required) {
    if (!process.env[key]) throw new Error(`${key} must be set`);
  }

  await auth.login({
    type: "lazer",
    login: process.env.OSU_USERNAME!,
    password: process.env.OSU_PASSWORD!,
    cachedTokenPath: "./client.json",
  });

  console.log("osu! API authenticated");

  serve({ fetch: app.fetch, port: 3001 }, (info) => {
    console.log(`API server running on http://localhost:${info.port}`);
  });
};

startServer();
