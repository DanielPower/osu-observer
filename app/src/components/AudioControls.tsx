import { useState, useEffect } from "react";
import { Box, DropdownMenu, Flex, IconButton, Popover, Slider, Text } from "@radix-ui/themes";
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
  const [dragSeekValue, setDragSeekValue] = useState(0);
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

  const seekValue = isDragging ? dragSeekValue : duration > 0 ? (currentTime / duration) * 100 : 0;

  function handleSeek(value: number) {
    if (audio && duration > 0) {
      onSeek((value / 100) * duration);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const timeMs = fraction * duration * 1000;
    const toleranceMs = (duration * 1000 * 6) / rect.width;
    const nearby = marks.find((mark) => Math.abs(mark.time - timeMs) <= toleranceMs);
    const time = formatTimestamp(fraction * duration);
    setHover({ fraction, label: nearby ? `${time} · ${nearby.label}` : time });
  }

  const durationMs = duration * 1000;

  return (
    <Box>
      <Box
        position="relative"
        px="3"
        pt="4"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
      >
        {durationMs > 0 && (
          <Box
            aria-hidden="true"
            position="absolute"
            style={{ left: "var(--space-3)", right: "var(--space-3)", top: 0, height: 16 }}
          >
            {marks.map((mark) => (
              <span
                key={`${mark.time}-${mark.label}`}
                style={{
                  position: "absolute",
                  left: `${(mark.time / durationMs) * 100}%`,
                  bottom: 0,
                  width: 2,
                  marginLeft: -1,
                  height: MARK_STYLE[mark.kind].height,
                  borderRadius: 1,
                  backgroundColor: MARK_STYLE[mark.kind].color,
                }}
              />
            ))}
          </Box>
        )}
        {hover && (
          <Text
            size="1"
            weight="bold"
            className="tabular"
            style={{
              position: "absolute",
              top: -22,
              left: `calc(var(--space-3) + ${hover.fraction} * (100% - 2 * var(--space-3)))`,
              transform: "translateX(-50%)",
              padding: "2px 8px",
              borderRadius: "var(--radius-2)",
              backgroundColor: "var(--gray-12)",
              color: "var(--gray-1)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {hover.label}
          </Text>
        )}
        <Slider
          size="2"
          value={[seekValue]}
          min={0}
          max={100}
          step={0.001}
          disabled={!audio}
          aria-label="Seek"
          onValueChange={(values) => {
            const val = values[0]!;
            setDragSeekValue(val);
            handleSeek(val);
          }}
          onPointerDown={() => {
            setDragSeekValue(seekValue);
            setIsDragging(true);
          }}
          onPointerUp={() => setIsDragging(false)}
        />
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
