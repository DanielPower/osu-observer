import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
// import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
// import { NotFound } from "./components/NotFound";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    // defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <div>Not found, sad</div>,
    scrollRestoration: true,
  });
  return router;
}
