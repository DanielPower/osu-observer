import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tanstackStart({ srcDirectory: "src" }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    nitro({
      plugins: ["./src/server/plugins/log-errors", "./src/server/plugins/migrate"],
      rollupConfig: {
        plugins: [
          {
            name: "cjs-shim",
            renderChunk(code: string) {
              if (!code.includes("__filename") && !code.includes("__dirname")) {
                return null;
              }
              const shim =
                [
                  "import { fileURLToPath as __$$fileURLToPath } from 'node:url';",
                  "import { dirname as __$$dirname } from 'node:path';",
                  "const __filename = __$$fileURLToPath(import.meta.url);",
                  "const __dirname = __$$dirname(__filename);",
                ].join("\n") + "\n";
              return { code: shim + code, map: null };
            },
          },
        ],
      },
    }),
  ],
});
