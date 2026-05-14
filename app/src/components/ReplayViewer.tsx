import { useEffect, useRef, useState, useCallback } from "react";
import { useSearch } from "@tanstack/react-router";
import type { Simulation } from "osu-renderer";
import { type StandardModCombination } from "osu-standard-stable";
import { AudioControls } from "./AudioControls";
import { OptionsPopup } from "./OptionsPopup";
import { useReplaySetup } from "../hooks/useReplaySetup";
import { useSkinTextures } from "../hooks/useSkinTextures";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

const SKIN_COMBO_COLORS: Record<string, number[]> = {
  default: [0xff0000, 0x00ff00],
  Cookiezi04: [0xcccc00, 0x00cccc, 0xcc00cc],
};

const modAssetNames: Record<string, string> = {
  HD: "selection-mod-hidden.png",
  HR: "selection-mod-hardrock.png",
  DT: "selection-mod-doubletime.png",
  FL: "selection-mod-flashlight.png",
  EZ: "selection-mod-easy.png",
  NF: "selection-mod-nofail.png",
  HT: "selection-mod-halftime.png",
  SD: "selection-mod-suddendeath.png",
  PF: "selection-mod-perfect.png",
  SO: "selection-mod-spunout.png",
  NC: "selection-mod-doubletime.png",
};

export function ReplayViewer({
  scoreId,
  beatmapUrl,
  bgUrl,
  beatmapSetId,
  simulation,
  rawMods,
  onBackgroundUrl,
  autoplay = false,
  mediaPath,
}: {
  scoreId: string;
  beatmapUrl: string;
  bgUrl: string | null;
  beatmapSetId: number;
  simulation: Simulation;
  rawMods: number;
  onBackgroundUrl?: (url: string | null) => void;
  autoplay?: boolean;
  mediaPath: string;
}) {
  const { skin } = useSearch({ from: "/score/$scoreId" });
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [backgroundDim, setBackgroundDim] = useState(0.5);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [useBeatmapComboColors, setUseBeatmapComboColors] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [cursorAnalysis, setCursorAnalysis] = useState(false);

  const {
    rendererRef,
    audioRef,
    audio,
    mods,
    beatmapComboColorsRef,
    basePlaybackRateRef,
    simulationFramesRef,
    hitObjectTimesRef,
  } = useReplaySetup({
    scoreId,
    beatmapUrl,
    bgUrl,
    beatmapSetId,
    simulation,
    rawMods,
    mediaPath,
    containerRef,
    autoplay,
    skin,
    backgroundDim,
    onBackgroundUrl,
  });

  useSkinTextures(skin, mediaPath);
  useKeyboardShortcuts(audioRef, simulationFramesRef, hitObjectTimesRef);

  useEffect(() => {
    if (!useBeatmapComboColors) {
      rendererRef.current?.setComboColors(SKIN_COMBO_COLORS[skin] ?? SKIN_COMBO_COLORS.default);
    }
  }, [rendererRef, skin, useBeatmapComboColors]);

  useEffect(() => {
    if (!mods) return;
    const modInfos = (mods as StandardModCombination).all
      .map((mod) => {
        const assetName = modAssetNames[mod.acronym];
        if (!assetName) return null;
        return {
          acronym: mod.acronym,
          iconUrl: `${mediaPath}/skins/${skin}/${assetName}`,
        };
      })
      .filter((info): info is { acronym: string; iconUrl: string } => Boolean(info));
    rendererRef.current?.setMods(modInfos);
  }, [mediaPath, mods, rendererRef, skin]);

  const handleBackgroundDimChange = useCallback(
    (newDim: number) => {
      setBackgroundDim(newDim);
      rendererRef.current?.setBackgroundDim(newDim);
    },
    [rendererRef],
  );

  const handleUseBeatmapComboColorsChange = useCallback(
    (value: boolean) => {
      setUseBeatmapComboColors(value);
      if (value) {
        rendererRef.current?.setComboColors(beatmapComboColorsRef.current);
      } else {
        rendererRef.current?.setComboColors(SKIN_COMBO_COLORS[skin] ?? SKIN_COMBO_COLORS.default);
      }
    },
    [beatmapComboColorsRef, rendererRef, skin],
  );

  const handleCursorAnalysisChange = useCallback(
    (enabled: boolean) => {
      setCursorAnalysis(enabled);
      rendererRef.current?.setCursorAnalysis(enabled);
    },
    [rendererRef],
  );

  const handlePlaybackSpeedChange = useCallback(
    (speed: number) => {
      setPlaybackSpeed(speed);
      if (audioRef.current) {
        audioRef.current.playbackRate = basePlaybackRateRef.current * speed;
      }
    },
    [audioRef, basePlaybackRateRef],
  );

  const handleViewerClick = useCallback(() => {
    const currentAudio = audioRef.current;
    if (currentAudio) {
      if (currentAudio.paused) currentAudio.play();
      else currentAudio.pause();
    }
  }, [audioRef]);

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
        boxShadow: "0 25px 50px -12px color-mix(in oklab, var(--accent-9) 30%, transparent)",
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
          backgroundDim={backgroundDim}
          onBackgroundDimChange={handleBackgroundDimChange}
          useBeatmapComboColors={useBeatmapComboColors}
          onUseBeatmapComboColorsChange={handleUseBeatmapComboColorsChange}
          playbackSpeed={playbackSpeed}
          onPlaybackSpeedChange={handlePlaybackSpeedChange}
          cursorAnalysis={cursorAnalysis}
          onCursorAnalysisChange={handleCursorAnalysisChange}
        />
      </div>
      {audio && (
        <div className="fullscreen-controls" style={{ zIndex: 20 }}>
          <AudioControls
            audio={audio}
            fullscreenContainer={wrapperRef.current}
            onOptionsClick={() => setOptionsOpen(true)}
          />
        </div>
      )}
    </div>
  );
}
