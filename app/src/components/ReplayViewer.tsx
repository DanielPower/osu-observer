import { useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import type { Simulation } from "osu-renderer";
import { AudioControls } from "./AudioControls";
import { OptionsPopup } from "./OptionsPopup";
import { useReplaySetup } from "../hooks/useReplaySetup";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

const SKIN_COMBO_COLORS: Record<string, number[]> = {
  default: [0xff0000, 0x00ff00],
  Cookiezi04: [0xcccc00, 0x00cccc, 0xcc00cc],
};

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
      <style>{`
        .fullscreen-wrapper:fullscreen {
          display: flex;
          flex-direction: column;
          background-color: rgb(2, 6, 23);
          padding: 0;
        }
        .fullscreen-wrapper:fullscreen .fullscreen-video {
          flex: 1;
          aspect-ratio: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .fullscreen-wrapper:fullscreen .viewer-container canvas {
          max-height: 100%;
          max-width: 100%;
          width: auto;
          height: auto;
        }
        .viewer-container {
          aspect-ratio: 16/9;
          background-image: url(${bgUrl});
          background-color: rgba(0, 0, 0, ${backgroundDim});
          background-blend-mode: darken;
          background-size: cover;
        }
        .viewer-container canvas {
          display: block;
          max-width: 100%;
        }
      `}</style>
      <div style={{ position: "relative" }}>
        <div
          ref={containerRef}
          className="fullscreen-video viewer-container"
          role="button"
          tabIndex={0}
          onClick={handleViewerClick}
          onKeyDown={() => {}}
        />
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
  );
}
