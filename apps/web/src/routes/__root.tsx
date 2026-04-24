import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { useAuth, useLogout } from "../hooks/useAuth";

const RootLayout = () => {
  const navigate = useNavigate();
  const [scoreIdInput, setScoreIdInput] = useState("");
  const { data: user } = useAuth();
  const logout = useLogout();

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
            {user ? (
              <div className="flex items-center gap-3">
                <img
                  src={user.avatar_url}
                  alt={user.username}
                  className="h-8 w-8 rounded-full"
                />
                <span className="text-sm text-slate-300">{user.username}</span>
                <button
                  onClick={() => logout.mutate()}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
                >
                  Logout
                </button>
              </div>
            ) : (
              <a
                href="/api/auth/login"
                className="rounded-lg bg-pink-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-pink-700"
              >
                Login with osu!
              </a>
            )}
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
