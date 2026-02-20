import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";

const RootLayout = () => {
  const navigate = useNavigate();
  const [scoreIdInput, setScoreIdInput] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = scoreIdInput.trim();
    if (trimmed) {
      navigate({ to: "/score/$scoreId", params: { scoreId: trimmed } });
      setScoreIdInput("");
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-700 bg-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="/">
            <h1 className="text-2xl font-bold text-white">osu! observer</h1>
          </a>
          <div className="flex items-center gap-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={scoreIdInput}
                onChange={(e) => setScoreIdInput(e.target.value)}
                placeholder="Score ID"
                className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Go
              </button>
            </form>
          </div>
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
});
