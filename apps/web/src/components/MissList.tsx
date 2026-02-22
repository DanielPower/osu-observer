function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

export function MissList({
  misses,
  onSeek,
}: {
  misses: { time: number }[];
  onSeek: (timeMs: number) => void;
}) {
  if (misses.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg bg-slate-900 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">
        Misses ({misses.length})
      </h3>
      <ul className="flex flex-wrap gap-1">
        {misses.map((miss, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSeek(miss.time)}
              className="rounded bg-slate-800 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-slate-700"
            >
              {formatTime(miss.time)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
