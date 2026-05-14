import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/discussion")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/discussion"!</div>;
}
