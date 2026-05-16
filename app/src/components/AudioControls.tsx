import { useState, useMemo, useSyncExternalStore } from "react";
import { Flex, IconButton, Slider, Text } from "@radix-ui/themes";
import {
  PlayIcon,
  PauseIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  GearIcon,
} from "@radix-ui/react-icons";

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

function makeAudioSubscribe(audio: HTMLAudioElement | null, ...events: string[]) {
  return (notify: () => void) => {
    if (!audio) return () => {};
    for (const event of events) audio.addEventListener(event, notify);
    return () => {
      for (const event of events) audio.removeEventListener(event, notify);
    };
  };
}

function subscribeFullscreen(notify: () => void) {
  document.addEventListener("fullscreenchange", notify);
  return () => document.removeEventListener("fullscreenchange", notify);
}

export function AudioControls({
  audio,
  fullscreenContainer,
  onOptionsClick,
}: {
  audio: HTMLAudioElement | null;
  fullscreenContainer: HTMLElement | null;
  onOptionsClick: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragSeekValue, setDragSeekValue] = useState(0);

  const subscribePlaying = useMemo(() => makeAudioSubscribe(audio, "play", "pause"), [audio]);
  const isPlaying = useSyncExternalStore(subscribePlaying, () => (audio ? !audio.paused : false));

  const subscribeDuration = useMemo(
    () => makeAudioSubscribe(audio, "durationchange", "loadedmetadata"),
    [audio],
  );
  const duration = useSyncExternalStore(subscribeDuration, () => audio?.duration || 0);

  const subscribeTime = useMemo(() => makeAudioSubscribe(audio, "timeupdate"), [audio]);
  const currentTime = useSyncExternalStore(subscribeTime, () => audio?.currentTime || 0);

  const isFullscreen = useSyncExternalStore(subscribeFullscreen, () => !!document.fullscreenElement);

  const seekValue = isDragging ? dragSeekValue : duration > 0 ? (currentTime / duration) * 100 : 0;

  function handleSeek(value: number) {
    if (audio && duration > 0) {
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
    <Flex
      align="center"
      gap="3"
      p="2"
      px="3"
      style={{
        backgroundColor: "color-mix(in oklab, var(--accent-3) 70%, transparent)",
        borderTop: "1px solid var(--accent-a5)",
        backdropFilter: "blur(8px)",
      }}
    >
      <IconButton
        size="3"
        radius="full"
        variant="solid"
        onClick={() => audio && togglePause(audio)}
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!audio}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </IconButton>

      <Flex flexGrow="1" align="center">
        <Slider
          size="2"
          value={[seekValue]}
          min={0}
          max={100}
          step={0.001}
          disabled={!audio}
          onValueChange={(values) => {
            const val = values[0];
            setDragSeekValue(val);
            handleSeek(val);
          }}
          onPointerDown={() => {
            setDragSeekValue(seekValue);
            setIsDragging(true);
          }}
          onPointerUp={() => setIsDragging(false)}
        />
      </Flex>

      <Text
        size="2"
        color="gray"
        style={{ fontFamily: "var(--code-font-family)", minWidth: 100 }}
        align="center"
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </Text>

      <IconButton
        size="3"
        radius="full"
        variant="soft"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        disabled={!fullscreenContainer}
      >
        {isFullscreen ? <ExitFullScreenIcon /> : <EnterFullScreenIcon />}
      </IconButton>

      <IconButton
        size="3"
        radius="full"
        variant="soft"
        onClick={onOptionsClick}
        aria-label="Open options"
      >
        <GearIcon />
      </IconButton>
    </Flex>
  );
}
