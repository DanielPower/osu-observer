import { useEffect } from "react";
import type { RefObject } from "react";
import type { SimulatedFrames } from "osu-renderer";

// Returns the time (ms) of the entry just before or after `timeMs` in a sorted list of times.
export function neighbourTime(
  times: ArrayLike<number>,
  timeMs: number,
  direction: -1 | 1,
): number | null {
  if (times.length === 0) return null;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! < timeMs) lo = mid + 1;
    else hi = mid;
  }
  const targetIndex = direction < 0 ? Math.max(0, lo - 1) : Math.min(times.length - 1, lo + 1);
  return times[targetIndex]!;
}

export function stepTo(
  audio: HTMLAudioElement,
  seekTo: (timeSeconds: number) => void,
  times: ArrayLike<number>,
  direction: -1 | 1,
) {
  const target = neighbourTime(times, audio.currentTime * 1000, direction);
  if (target === null) return;
  audio.pause();
  seekTo(target / 1000);
}

export function useKeyboardShortcuts(
  audioRef: RefObject<HTMLAudioElement | null>,
  seekTo: (timeSeconds: number) => void,
  simulationFramesRef: RefObject<SimulatedFrames | null>,
  hitObjectTimesRef: RefObject<number[]>,
  onToggleFullscreen: () => void,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

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
        const times = simulationFramesRef.current?.time ?? [];
        stepTo(currentAudio, seekTo, times, e.key === "," ? -1 : 1);
      } else if (e.key === "<" || e.key === ">") {
        e.preventDefault();
        stepTo(currentAudio, seekTo, hitObjectTimesRef.current, e.key === "<" ? -1 : 1);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        onToggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioRef, seekTo, simulationFramesRef, hitObjectTimesRef, onToggleFullscreen]);
}

export const KEYBOARD_SHORTCUTS = [
  { keys: "Space", action: "Play or pause" },
  { keys: "← →", action: "Back or forward 5 seconds" },
  { keys: ", .", action: "Previous or next frame" },
  { keys: "< >", action: "Previous or next hit object" },
  { keys: "F", action: "Fullscreen" },
];
