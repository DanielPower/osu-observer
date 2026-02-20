import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ReplayViewer } from "../../components/ReplayViewer";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

type ScoreData = {
  scoreId: string;
  username: string;
  beatmapId: number;
  beatmap: {
    id: number;
    beatmapSetId: number;
    title: string;
    artist: string;
    creator: string;
    version: string;
  };
};

function ScorePage() {
  const { scoreId } = Route.useParams();

  const { data, isLoading, error } = useQuery<ScoreData>({
    queryKey: ["score", scoreId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/score/${scoreId}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to fetch score");
      }
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <p className="text-xl text-slate-300">Loading beatmap data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <p className="text-xl text-red-400">{error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="w-full bg-linear-to-b from-slate-900 to-slate-800">
      <div className="mx-auto px-4 py-8">
        {/* Title Section */}
        <div className="mb-4 text-center">
          <h1 className="mb-1 text-5xl font-bold text-white">
            {data.beatmap.title}
          </h1>
          <p className="mb-2 text-2xl text-slate-300">{data.beatmap.artist}</p>
          <span>
            <div className="inline-block rounded-lg bg-blue-600 px-2 py-1">
              <p className="text-lg font-semibold text-white">
                {data.beatmap.version}
              </p>
            </div>
          </span>
        </div>

        {/* Replay Viewer */}
        <ReplayViewer
          scoreId={data.scoreId}
          beatmapId={`${data.beatmap.id}`}
          beatmapSetId={`${data.beatmap.beatmapSetId}`}
        />

        {/* Metadata Section */}
        <div className="rounded-xl bg-slate-800 p-6 shadow-xl">
          <h2 className="mb-4 text-2xl font-bold text-white">
            Replay Information
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-slate-700 p-4">
              <p className="mb-1 text-sm text-slate-400">Player</p>
              <p className="text-lg font-semibold text-white">
                {data.username}
              </p>
            </div>
            <div className="rounded-lg bg-slate-700 p-4">
              <p className="mb-1 text-sm text-slate-400">Score ID</p>
              <p className="text-lg font-semibold text-white">{data.scoreId}</p>
            </div>
            <div className="rounded-lg bg-slate-700 p-4">
              <p className="mb-1 text-sm text-slate-400">Beatmap Set ID</p>
              <p className="text-lg font-semibold text-white">
                {data.beatmap.beatmapSetId}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/score/$scoreId")({
  component: ScorePage,
});
