import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { isSpeedrunKind, speedrunKey, speedrunWindow } from "../../../lib/speedrun-periods";

export const Route = createFileRoute("/speedruns/$kind/")({
  beforeLoad: ({ params }) => {
    if (!isSpeedrunKind(params.kind)) throw notFound();
    const { startsAt } = speedrunWindow(params.kind, new Date());
    throw redirect({
      to: "/speedruns/$kind/$key",
      params: { kind: params.kind, key: speedrunKey(params.kind, startsAt) },
    });
  },
});
