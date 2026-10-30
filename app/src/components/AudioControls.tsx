import { useState, useEffect } from "react";
import { Box, DropdownMenu, Flex, IconButton, Popover, Text } from "@radix-ui/themes";
import {
  PlayIcon,
  PauseIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  GearIcon,
  TrackPreviousIcon,
  TrackNextIcon,
  KeyboardIcon,
} from "@radix-ui/react-icons";
import { formatTimestamp, type JudgementMark } from "../lib/score-summary";
import { KEYBOARD_SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import { PLAYBACK_SPEEDS } from "../hooks/usePlayerSettings";

const MARK_HIT_SLOP_PX = 6;

const MARK_STYLE: Record<JudgementMark["kind"], { color: string; height: number }> = {
  miss: { color: "#ff7b7b", height: 14 },
  meh: { color: "#ffb347", height: 10 },
  ok: { color: "#7fe08a", height: 6 },
};

function togglePause(audio: HTMLAudioElement) {
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

export function AudioControls({
  audio,
  isFullscreen,
  onToggleFullscreen,
  onOptionsClick,
  onSeek,
  onStepObject,
  marks,
  playbackSpeed,
  onPlaybackSpeedChange,
  portalContainer,
}: {
  audio: HTMLAudioElement | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOptionsClick: () => void;
  onSeek: (timeSeconds: number) => void;
  onStepObject: (direction: -1 | 1) => void;
  marks: JudgementMark[];
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  portalContainer: HTMLElement | null;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragFraction, setDragFraction] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hover, setHover] = useState<{ fraction: number; label: string } | null>(null);

  useEffect(() => {
    if (!audio) {
      setIsPlaying(false);
      setDuration(0);
      setCurrentTime(0);
      return;
    }
    const onPlayPause = () => setIsPlaying(!audio.paused);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);

    // The audio element may have already loaded its metadata (and fired these
    // events) before this effect subscribed, so sync current state immediately.
    onPlayPause();
    onDurationChange();
    onTimeUpdate();

    audio.addEventListener("play", onPlayPause);
    audio.addEventListener("pause", onPlayPause);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("loadedmetadata", onDurationChange);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("seeked", onTimeUpdate);

    return () => {
      audio.removeEventListener("play", onPlayPause);
      audio.removeEventListener("pause", onPlayPause);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("loadedmetadata", onDurationChange);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("seeked", onTimeUpdate);
    };
  }, [audio]);

  const durationMs = duration * 1000;
  const progress = isDragging
    ? dragFraction
    : duration > 0
      ? Math.min(1, currentTime / duration)
      : 0;

  function pointerFraction(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }

  // A mark within a few pixels of the pointer, so the thin markers are easy to hit.
  function markNear(e: React.PointerEvent<HTMLDivElement>, fraction: number) {
    const width = e.currentTarget.getBoundingClientRect().width;
    const toleranceMs = (durationMs * MARK_HIT_SLOP_PX) / width;
    const timeMs = fraction * durationMs;
    let nearest: JudgementMark | undefined;
    for (const mark of marks) {
      const distance = Math.abs(mark.time - timeMs);
      if (distance <= toleranceMs && (!nearest || distance < Math.abs(nearest.time - timeMs))) {
        nearest = mark;
      }
    }
    return nearest;
  }

  function seekToFraction(fraction: number) {
    setDragFraction(fraction);
    onSeek(fraction * duration);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!audio || duration <= 0 || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const fraction = pointerFraction(e);
    const mark = markNear(e, fraction);
    seekToFraction(mark ? mark.time / durationMs : fraction);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (duration <= 0) return;
    const fraction = pointerFraction(e);
    if (isDragging) {
      seekToFraction(fraction);
      setHover({ fraction, label: formatTimestamp(fraction * duration) });
      return;
    }
    const mark = markNear(e, fraction);
    const markFraction = mark ? mark.time / durationMs : fraction;
    const time = formatTimestamp(markFraction * duration);
    setHover({ fraction: markFraction, label: mark ? `${time} · ${mark.label}` : time });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
  }

  return (
    <Box>
      <Box px="3" pt="2">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(progress * duration)}
          aria-valuetext={`${formatTimestamp(progress * duration)} of ${formatTimestamp(duration)}`}
          aria-disabled={!audio}
          className="seek-bar"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            if (!isDragging) setHover(null);
          }}
        >
          {durationMs > 0 &&
            marks.map((mark) => (
              <span
                key={`${mark.time}-${mark.label}`}
                aria-hidden="true"
                className="seek-mark"
                style={{
                  left: `${(mark.time / durationMs) * 100}%`,
                  height: MARK_STYLE[mark.kind].height,
                  backgroundColor: MARK_STYLE[mark.kind].color,
                }}
              />
            ))}
          <div className="seek-track">
            <div className="seek-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="seek-thumb" style={{ left: `${progress * 100}%` }} />
          {hover && (
            <Text
              size="1"
              weight="bold"
              className="tabular seek-tooltip"
              style={{ left: `${hover.fraction * 100}%` }}
            >
              {hover.label}
            </Text>
          )}
        </div>
      </Box>
      <Flex align="center" gap="1" px="2" py="2" wrap="wrap">
        <IconButton
          size="3"
          variant="solid"
          onClick={() => audio && togglePause(audio)}
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!audio}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <IconButton
          size="3"
          variant="ghost"
          color="gray"
          style={{ margin: 0 }}
          onClick={() => onStepObject(-1)}
          aria-label="Previous hit object"
          disabled={!audio}
        >
          <TrackPreviousIcon />
        </IconButton>
        <IconButton
          size="3"
          variant="ghost"
          color="gray"
          style={{ margin: 0 }}
          onClick={() => onStepObject(1)}
          aria-label="Next hit object"
          disabled={!audio}
        >
          <TrackNextIcon />
        </IconButton>

        <Text size="2" className="tabular" style={{ padding: "0 var(--space-2)" }}>
          {formatTimestamp(currentTime)} <Text color="gray">/ {formatTimestamp(duration)}</Text>
        </Text>

        <Box flexGrow="1" />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <button
              type="button"
              className="rt-reset"
              aria-label={`Playback speed, ${playbackSpeed}×`}
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 9999,
                border: "1px solid var(--gray-a6)",
                background: "var(--gray-a3)",
                color: "var(--gray-12)",
                fontSize: "var(--font-size-2)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {playbackSpeed}×
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content size="1" container={portalContainer ?? undefined}>
            <DropdownMenu.RadioGroup
              value={String(playbackSpeed)}
              onValueChange={(value) => onPlaybackSpeedChange(Number(value))}
            >
              {PLAYBACK_SPEEDS.map((speed) => (
                <DropdownMenu.RadioItem key={speed} value={String(speed)}>
                  {speed}×
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <Popover.Root>
          <Popover.Trigger>
            <IconButton
              size="3"
              variant="ghost"
              color="gray"
              aria-label="Keyboard shortcuts"
              style={{ margin: 0 }}
            >
              <KeyboardIcon />
            </IconButton>
          </Popover.Trigger>
          <Popover.Content size="2" width="300px" container={portalContainer ?? undefined}>
            <Flex direction="column" gap="2">
              <Text size="2" weight="bold">
                Keyboard shortcuts
              </Text>
              {KEYBOARD_SHORTCUTS.map((shortcut) => (
                <Flex key={shortcut.keys} justify="between" align="center" gap="3">
                  <Text size="2" color="gray">
                    {shortcut.action}
                  </Text>
                  <kbd
                    style={{
                      minWidth: 28,
                      textAlign: "center",
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: "var(--gray-a3)",
                      border: "1px solid var(--gray-a6)",
                      borderBottomWidth: 3,
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                  >
                    {shortcut.keys}
                  </kbd>
                </Flex>
              ))}
            </Flex>
          </Popover.Content>
        </Popover.Root>

        <IconButton
          size="3"
          variant="ghost"
          color="gray"
          style={{ margin: 0 }}
          onClick={onOptionsClick}
          aria-label="Open settings"
        >
          <GearIcon />
        </IconButton>

        <IconButton
          size="3"
          variant="ghost"
          color="gray"
          style={{ margin: 0 }}
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <ExitFullScreenIcon /> : <EnterFullScreenIcon />}
        </IconButton>
      </Flex>
    </Box>
  );
}
