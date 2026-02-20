import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [scoreId, setScoreId] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = scoreId.trim();
    if (trimmed) {
      navigate({ to: "/score/$scoreId", params: { scoreId: trimmed } });
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center">
      <p className="mb-4 text-center text-xl">
        Quickly view and analyze osu! replays. Enter a Score ID below to get
        started.
      </p>
      <form className="mb-6 w-full max-w-md" onSubmit={handleSubmit}>
        <input
          type="text"
          value={scoreId}
          onChange={(e) => setScoreId(e.target.value)}
          placeholder="Enter Score ID"
          className="w-full rounded-lg border border-gray-300 p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-blue-600 p-3 text-white transition-colors hover:bg-blue-600"
        >
          View Beatmap
        </button>
      </form>
    </div>
  );
}
