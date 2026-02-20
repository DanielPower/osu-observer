import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { auth } from "osu-api-extended";
import score from "./routes/score.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ status: "ok" });
});

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
  if (!process.env.OSU_USERNAME || !process.env.OSU_PASSWORD) {
    throw new Error("OSU_USERNAME and OSU_PASSWORD must be set");
  }
  if (!process.env.SAVE_MEDIA_PATH) {
    throw new Error("SAVE_MEDIA_PATH must be set");
  }

  await auth.login({
    type: "lazer",
    login: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    cachedTokenPath: "./client.json",
  });

  console.log("osu! API authenticated");

  serve({ fetch: app.fetch, port: 3001 }, (info) => {
    console.log(`API server running on http://localhost:${info.port}`);
  });
};

startServer();
