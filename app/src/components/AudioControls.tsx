import { useState, useEffect } from "react";
import { Box, Flex, IconButton, Slider, Text } from "@radix-ui/themes";
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

export function AudioControls({
  audio,
  fullscreenContainer,
  onOptionsClick,
  onSeek,
}: {
  audio: HTMLAudioElement | null;
  fullscreenContainer: HTMLElement | null;
  onOptionsClick: () => void;
  onSeek: (timeSeconds: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragSeekValue, setDragSeekValue] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

    audio.addEventListener("play", onPlayPause);
    audio.addEventListener("pause", onPlayPause);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("loadedmetadata", onDurationChange);
    audio.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      audio.removeEventListener("play", onPlayPause);
      audio.removeEventListener("pause", onPlayPause);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("loadedmetadata", onDurationChange);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [audio]);

  useEffect(() => {
    const update = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const seekValue = isDragging ? dragSeekValue : duration > 0 ? (currentTime / duration) * 100 : 0;

  function handleSeek(value: number) {
    if (audio && duration > 0) {
      onSeek((value / 100) * duration);
    }
  }

  function toggleFullscreen() {
    if (!fullscreenContainer) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      fullscreenContainer.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    }
  }

  return (
    <Box position="relative">
      <Slider
        size="2"
        value={[seekValue]}
        min={0}
        max={100}
        step={0.001}
        disabled={!audio}
        radius="none"
        variant="soft"
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
        style={{ zIndex: 1 }}
      />
      <Flex
        align="center"
        gap="2"
        p="2"
        style={{
          backgroundColor: "color-mix(in oklab, var(--accent-3) 70%, transparent)",
          borderTop: "1px solid var(--accent-a5)",
          backdropFilter: "blur(8px)",
        }}
      >
        <IconButton
          size="2"
          radius="medium"
          variant="solid"
          onClick={() => audio && togglePause(audio)}
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!audio}
          style={{ minWidth: "3rem" }}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </IconButton>

        <Flex flexGrow="1" align="center"></Flex>

        <Text
          size="2"
          color="gray"
          style={{ fontFamily: "var(--code-font-family)", minWidth: 100 }}
          align="center"
        >
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>

        <IconButton
          size="2"
          radius="medium"
          variant="soft"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          disabled={!fullscreenContainer}
        >
          {isFullscreen ? <ExitFullScreenIcon /> : <EnterFullScreenIcon />}
        </IconButton>

        <IconButton
          size="2"
          radius="medium"
          variant="soft"
          onClick={onOptionsClick}
          aria-label="Open options"
        >
          <GearIcon />
        </IconButton>
      </Flex>
    </Box>
  );
}
