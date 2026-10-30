import { useEffect, useState } from "react";
import type { Simulation } from "osu-renderer";
import type { LazerMod } from "osu-simulation";
import type {
  SimulateReplayMessage,
  SimulateReplayRequest,
} from "../workers/simulate-replay.worker";

type SimulateReplayReply = { id: number; simulation?: Simulation; error?: string };
type PendingRequest = { resolve: (simulation: Simulation) => void; reject: (error: Error) => void };

// One worker is kept for every replay the page simulates: a fresh worker spends about
// half its time compiling the simulator, which a reused one has already done.
let worker: Worker | null = null;
let nextRequestId = 0;
const pendingRequests = new Map<number, PendingRequest>();

function discardWorker(reason: Error) {
  worker?.terminate();
  worker = null;
  for (const request of pendingRequests.values()) request.reject(reason);
  pendingRequests.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/simulate-replay.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }: MessageEvent<SimulateReplayReply>) => {
    const request = pendingRequests.get(data.id);
    if (!request) return;
    // oxlint-disable-next-line drizzle/enforce-delete-with-where
    pendingRequests.delete(data.id);
    if (data.simulation) request.resolve(data.simulation);
    else request.reject(new Error(data.error ?? "Couldn't simulate the replay"));
  };
  worker.onerror = (event) => {
    discardWorker(new Error(event.message || "Couldn't simulate the replay"));
  };
  return worker;
}

function simulateInWorker(request: SimulateReplayRequest) {
  const id = nextRequestId++;
  const promise = new Promise<Simulation>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    const message: SimulateReplayMessage = { ...request, id };
    getWorker().postMessage(message);
  });
  // A cancelled simulation that is the only one running stops the worker, so a long
  // replay left behind doesn't hold up the next one. Otherwise its result is ignored.
  const cancel = () => {
    // oxlint-disable-next-line drizzle/enforce-delete-with-where
    if (!pendingRequests.delete(id)) return;
    if (pendingRequests.size === 0) discardWorker(new Error("Cancelled"));
  };
  return { promise, cancel };
}

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
    const { promise: result, cancel } = simulateInWorker({
      replayUrl,
      beatmapUrl,
      mods: JSON.parse(modsKey) as LazerMod[],
    });
    // Consumers handle failures through `error` or by awaiting `promise`.
    result.catch(() => {});

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
      cancel();
    };
  }, [replayUrl, beatmapUrl, modsKey]);

  return { promise, simulation, error };
}
