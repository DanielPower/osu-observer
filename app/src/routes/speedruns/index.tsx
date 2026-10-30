import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/speedruns/")({
  beforeLoad: () => {
    throw redirect({ to: "/speedruns/$kind", params: { kind: "weekly" } });
  },
});
