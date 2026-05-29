import { useEffect } from "react";
import type { RefObject } from "react";
import type { SimulatedFrame } from "osu-renderer";

export function useKeyboardShortcuts(
  audioRef: RefObject<HTMLAudioElement | null>,
  seekTo: (timeSeconds: number) => void,
  simulationFramesRef: RefObject<SimulatedFrame[]>,
  hitObjectTimesRef: RefObject<number[]>,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const currentAudio = audioRef.current;
      if (!currentAudio) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (currentAudio.paused) currentAudio.play();
        else currentAudio.pause();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekTo(Math.max(0, currentAudio.currentTime - 5));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekTo(Math.min(currentAudio.duration, currentAudio.currentTime + 5));
      } else if (e.key === "," || e.key === ".") {
        e.preventDefault();
        const frames = simulationFramesRef.current;
        if (frames.length === 0) return;
        const timeMs = currentAudio.currentTime * 1000;
        let lo = 0;
        let hi = frames.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (frames[mid].time < timeMs) lo = mid + 1;
          else hi = mid;
        }
        const targetIndex =
          e.key === "," ? Math.max(0, lo - 1) : Math.min(frames.length - 1, lo + 1);
        currentAudio.pause();
        seekTo(frames[targetIndex].time / 1000);
      } else if (e.key === "<" || e.key === ">") {
        e.preventDefault();
        const times = hitObjectTimesRef.current;
        if (times.length === 0) return;
        const timeMs = currentAudio.currentTime * 1000;
        let lo = 0;
        let hi = times.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (times[mid] < timeMs) lo = mid + 1;
          else hi = mid;
        }
        const targetIndex =
          e.key === "<" ? Math.max(0, lo - 1) : Math.min(times.length - 1, lo + 1);
        currentAudio.pause();
        seekTo(times[targetIndex] / 1000);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioRef, seekTo, simulationFramesRef, hitObjectTimesRef]);
}
