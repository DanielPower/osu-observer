import { useState, useEffect, useCallback } from "react";

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function togglePause(audio: HTMLAudioElement) {
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

export function AudioControls({
  audio,
  fullscreenContainer,
  onOptionsClick,
}: {
  audio: HTMLAudioElement;
  fullscreenContainer: HTMLElement | null;
  onOptionsClick: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(!audio.paused);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio.duration || 0);
  const [seekValue, setSeekValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const updateTime = useCallback(() => {
    if (!isDragging) {
      setCurrentTime(audio.currentTime);
      if (audio.duration > 0) {
        setSeekValue((audio.currentTime / audio.duration) * 100);
      }
    }
  }, [audio, isDragging]);

  useEffect(() => {
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onDuration = () => {
      setDuration(audio.duration);
      updateTime();
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("loadedmetadata", onDuration);

    setIsPlaying(!audio.paused);
    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("loadedmetadata", onDuration);
    };
  }, [audio, updateTime]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function handleSeek(value: number) {
    if (!isNaN(duration) && duration > 0) {
      audio.currentTime = (value / 100) * duration;
    }
  }

  function toggleFullscreen() {
    if (!fullscreenContainer) return;
    if (!document.fullscreenElement) {
      fullscreenContainer.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded bg-slate-700 p-2">
      <button
        className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 focus:outline-none"
        onClick={() => togglePause(audio)}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      <div className="relative h-5 flex-grow">
        <div className="absolute w-full">
          <input
            type="range"
            min="0"
            max="100"
            value={seekValue}
            step="0.001"
            onInput={(e) => {
              const val = parseFloat(e.currentTarget.value);
              setSeekValue(val);
              handleSeek(val);
            }}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            className="absolute z-10 h-2 w-full cursor-pointer appearance-none bg-transparent"
          />
        </div>
        <div className="absolute top-1/2 right-0 left-0 h-2 -translate-y-1/2 rounded bg-gray-300" />
        <div
          className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded bg-blue-500"
          style={{ width: `${seekValue}%` }}
        />
      </div>

      <div className="min-w-[100px] text-center font-mono text-sm">
        <span>{formatTime(currentTime)}</span>
        <span className="mx-1">/</span>
        <span>{formatTime(duration)}</span>
      </div>

      <button
        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-600 text-white transition-colors hover:bg-slate-500 focus:outline-none"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        disabled={!fullscreenContainer}
      >
        {isFullscreen ? (
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
          </svg>
        ) : (
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
          </svg>
        )}
      </button>

      <button
        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-600 text-white transition-colors hover:bg-slate-500 focus:outline-none"
        onClick={onOptionsClick}
        aria-label="Open options"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
    </div>
  );
}
