import { createFileRoute } from "@tanstack/react-router";
import { currentSpeedruns } from "../../../lib/speedrun-standings";

export const Route = createFileRoute("/api/speedruns/current")({
  server: {
    handlers: {
      GET: async () => Response.json(await currentSpeedruns()),
    },
  },
});
