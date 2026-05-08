import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";

const MIME: Record<string, string> = {
  ".osu": "text/plain; charset=utf-8",
  ".osr": "application/octet-stream",
  ".mp3": "audio/mpeg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function devMediaPlugin() {
  return {
    name: "dev-media",
    configureServer(server: import("vite").ViteDevServer) {
      const mediaPath = process.env.SAVE_MEDIA_PATH;
      if (!mediaPath) return;
      const root = path.resolve(mediaPath);
      server.middlewares.use("/api/media", (req, res, next) => {
        const rel = decodeURIComponent(req.url ?? "/").replace(/^\/+/, "");
        const abs = path.resolve(root, rel);
        if (!abs.startsWith(root) || !existsSync(abs)) return next();
        const ext = path.extname(abs).toLowerCase();
        res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
        createReadStream(abs).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  server: {
    port: 3000,
  },
  resolve: {
    // "source" enables cross-package HMR for workspace packages in dev.
    // Must not apply in production — third-party packages may expose a
    // "source" condition that resolves to dev-mode entry points.
    conditions: command === "serve" ? ["source"] : [],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: "src" }),
    react(),
    nitro(),
    devMediaPlugin(),
  ],
  envDir: "..",
}));
