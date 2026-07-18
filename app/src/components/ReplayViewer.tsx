import { useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { Flex, Progress, Text } from "@radix-ui/themes";
import { CheckIcon } from "@radix-ui/react-icons";
import type { Simulation } from "osu-renderer";
import { AudioControls } from "./AudioControls";
import { OptionsPopup } from "./OptionsPopup";
import { useReplaySetup } from "../hooks/useReplaySetup";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

const SKIN_COMBO_COLORS: Record<string, number[]> = {
  default: [0xff0000, 0x00ff00],
  Cookiezi04: [0xcccc00, 0x00cccc, 0xcc00cc],
};

function LoadingRow({ label, progress, done }: { label: string; progress: number; done: boolean }) {
  return (
    <Flex align="center" gap="2">
      <Text size="1" style={{ color: "white", width: 56 }}>
        {label}
      </Text>
      <Progress value={progress} size="1" style={{ flex: 1 }} />
      <Flex align="center" justify="center" style={{ width: 14, height: 14, flexShrink: 0 }}>
        {done && <CheckIcon style={{ color: "var(--green-9)" }} />}
      </Flex>
    </Flex>
  );
}

export function ReplayViewer({
  scoreId,
  beatmapUrl,
  beatmapSetId,
  simulation,
  rawMods,
  autoplay = false,
  mediaPath,
  bgUrl,
}: {
  scoreId: string;
  beatmapUrl: string;
  beatmapSetId: number;
  simulation: Simulation;
  rawMods: number;
  autoplay?: boolean;
  mediaPath: string;
  bgUrl: string;
}) {
  const { skin } = useSearch({ from: "/score/$scoreId" });
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [backgroundDim, setBackgroundDim] = useState(0.5);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [useBeatmapComboColors, setUseBeatmapComboColors] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [cursorAnalysis, setCursorAnalysis] = useState(false);

  const skinUrl = `${mediaPath}/skins/${skin}.osk`;

  const {
    rendererRef,
    audioRef,
    audio,
    beatmapProgress,
    audioProgress,
    skinProgress,
    beatmapLoaded,
    audioLoaded,
    skinLoaded,
    beatmapComboColorsRef,
    simulationFramesRef,
    hitObjectTimesRef,
    seekTo,
    setVolume,
    applyPlaybackRate,
  } = useReplaySetup({
    scoreId,
    beatmapUrl,
    beatmapSetId,
    simulation,
    rawMods,
    mediaPath,
    containerRef,
    autoplay,
    skinUrl,
  });

  useKeyboardShortcuts(audioRef, seekTo, simulationFramesRef, hitObjectTimesRef);

  const [showLoadingUi, setShowLoadingUi] = useState(false);
  useEffect(() => {
    if (audio) {
      setShowLoadingUi(false);
      return;
    }
    const timer = setTimeout(() => setShowLoadingUi(true), 500);
    return () => clearTimeout(timer);
  }, [audio]);

  useEffect(() => {
    if (!useBeatmapComboColors) {
      rendererRef.current?.setComboColors(SKIN_COMBO_COLORS[skin] ?? SKIN_COMBO_COLORS.default);
    }
  }, [rendererRef, skin, useBeatmapComboColors]);

  function handleUseBeatmapComboColorsChange(value: boolean) {
    setUseBeatmapComboColors(value);
    if (value) {
      rendererRef.current?.setComboColors(beatmapComboColorsRef.current);
    } else {
      rendererRef.current?.setComboColors(SKIN_COMBO_COLORS[skin] ?? SKIN_COMBO_COLORS.default);
    }
  }

  function handleCursorAnalysisChange(enabled: boolean) {
    setCursorAnalysis(enabled);
    rendererRef.current?.setCursorAnalysis(enabled);
  }

  function handlePlaybackSpeedChange(speed: number) {
    setPlaybackSpeed(speed);
    applyPlaybackRate(speed);
  }

  function handleViewerClick() {
    const currentAudio = audioRef.current;
    if (currentAudio) {
      if (currentAudio.paused) currentAudio.play();
      else currentAudio.pause();
    }
  }

  return (
    <>
      <style>{`
      .viewer-container {
        aspect-ratio: 16/9;
        background-image: url(${bgUrl});
        background-color: rgba(0, 0, 0, ${backgroundDim});
        background-blend-mode: darken;
        background-size: cover;
      }
      .viewer-container canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      .fullscreen-wrapper:fullscreen {
        display: flex !important;
        flex-direction: column !important;
        background-color: black !important;
        border-radius: 0 !important;
        border: none !important;
      }
      .fullscreen-wrapper:fullscreen > div:first-child {
        flex: 1;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .fullscreen-wrapper:fullscreen .viewer-container {
        height: 100%;
        width: auto;
        max-width: 100%;
        aspect-ratio: 16/9;
      }
      .fullscreen-wrapper:fullscreen .fullscreen-controls {
        width: 100%;
        flex-shrink: 0;
      }
    `}</style>
      <div
        ref={wrapperRef}
        className="fullscreen-wrapper"
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "var(--radius-4)",
          backgroundColor: "var(--gray-1)",
          border: "1px solid var(--accent-a5)",
        }}
      >
        <div style={{ position: "relative" }}>
          <div
            ref={containerRef}
            className="fullscreen-video viewer-container"
            role="button"
            tabIndex={0}
            onClick={handleViewerClick}
            onKeyDown={() => {}}
          />
          {showLoadingUi && (
            <Flex
              align="center"
              justify="center"
              style={{ position: "absolute", inset: 0, zIndex: 10 }}
            >
              <Flex
                direction="column"
                gap="2"
                style={{
                  width: "min(260px, 80%)",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-3)",
                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                }}
              >
                <LoadingRow label="Beatmap" progress={beatmapProgress} done={beatmapLoaded} />
                <LoadingRow label="Audio" progress={audioProgress} done={audioLoaded} />
                <LoadingRow label="Skin" progress={skinProgress} done={skinLoaded} />
              </Flex>
            </Flex>
          )}
          <OptionsPopup
            open={optionsOpen}
            onClose={() => setOptionsOpen(false)}
            audio={audio}
            onVolumeChange={setVolume}
            backgroundDim={backgroundDim}
            onBackgroundDimChange={setBackgroundDim}
            useBeatmapComboColors={useBeatmapComboColors}
            onUseBeatmapComboColorsChange={handleUseBeatmapComboColorsChange}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={handlePlaybackSpeedChange}
            cursorAnalysis={cursorAnalysis}
            onCursorAnalysisChange={handleCursorAnalysisChange}
          />
        </div>
        <div className="fullscreen-controls" style={{ zIndex: 20 }}>
          <AudioControls
            audio={audio}
            fullscreenContainer={wrapperRef.current}
            onOptionsClick={() => setOptionsOpen(true)}
            onSeek={seekTo}
          />
        </div>
      </div>
    </>
  );
}
