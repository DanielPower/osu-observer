import { useState, useEffect, useCallback } from "react";
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
    <Flex
      align="center"
      gap="3"
      p="2"
      px="3"
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--accent-3) 70%, transparent)",
        borderTop: "1px solid var(--accent-a5)",
        backdropFilter: "blur(8px)",
      }}
    >
      <IconButton
        size="3"
        radius="full"
        variant="solid"
        onClick={() => togglePause(audio)}
        aria-label={isPlaying ? "Pause" : "Play"}
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
          onValueChange={(values) => {
            const val = values[0];
            setSeekValue(val);
            handleSeek(val);
          }}
          onPointerDown={() => setIsDragging(true)}
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
