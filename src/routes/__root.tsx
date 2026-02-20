import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const rootSearchSchema = z.object({
  skin: z.string().default("default"),
});

const RootLayout = () => {
  const { skin } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-700 bg-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="/">
            <h1 className="text-2xl font-bold text-white">osu! observer</h1>
          </a>
          <div className="flex justify-center gap-2">
            <div className="text-lg text-white">Skin</div>
            <select
              className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={skin}
              onChange={(event) => {
                navigate({
                  search: (prev) => ({
                    ...prev,
                    skin: event.currentTarget.value,
                  }),
                });
              }}
            >
              <option value="default">default</option>
              <option value="Cookiezi04">Cookiezi04</option>
              <option value="BubbleSkin17-10-13">BubbleSkin17-10-13</option>
            </select>
          </div>
          {/*<form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              bind:value={scoreId}
              placeholder="Score ID"
              className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Go
            </button>
          </form>*/}
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-1 text-white">
        <Outlet />
      </div>
      <TanStackRouterDevtools />
    </div>
  );
};

export const Route = createRootRoute({
  component: RootLayout,
  validateSearch: zodValidator(rootSearchSchema),
});
