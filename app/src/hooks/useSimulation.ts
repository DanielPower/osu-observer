import { useEffect, useState } from "react";
import type { Simulation } from "osu-renderer";
import type { LazerMod } from "osu-simulation";
import type { SimulateReplayRequest } from "../workers/simulate-replay.worker";

/**
 * Simulates a score in the browser from its replay. `promise` is set right after mount, so other
 * loading can wait on it while it runs; `simulation` is set once it finishes.
 */
export function useSimulation({ replayUrl, beatmapUrl, mods }: SimulateReplayRequest) {
  const [promise, setPromise] = useState<Promise<Simulation> | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compared by value, so a new array with the same mods doesn't simulate again.
  const modsKey = JSON.stringify(mods);

  useEffect(() => {
    let cancelled = false;
    const worker = new Worker(new URL("../workers/simulate-replay.worker.ts", import.meta.url), {
      type: "module",
    });
    const request: SimulateReplayRequest = {
      replayUrl,
      beatmapUrl,
      mods: JSON.parse(modsKey) as LazerMod[],
    };
    const result = new Promise<Simulation>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<{ simulation?: Simulation; error?: string }>) => {
        worker.terminate();
        if (data.simulation) resolve(data.simulation);
        else reject(new Error(data.error ?? "Couldn't simulate the replay"));
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || "Couldn't simulate the replay"));
      };
    });
    // Consumers handle failures through `error` or by awaiting `promise`.
    result.catch(() => {});
    worker.postMessage(request);

    setSimulation(null);
    setError(null);
    setPromise(result);
    result.then(
      (value) => {
        if (!cancelled) setSimulation(value);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );

    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, [replayUrl, beatmapUrl, modsKey]);

  return { promise, simulation, error };
}
