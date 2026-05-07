import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    conditions: ["source"],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      router: { routeFileIgnorePattern: "^api$" },
    }),
    react(),
    nitro({
      scanDirs: ["./src/routes"],
    }),
  ],
  envDir: "..",
});
