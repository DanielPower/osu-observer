import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { useSearch } from "@tanstack/react-router";
import { Button, Flex, Progress, Text } from "@radix-ui/themes";
import { CheckIcon } from "@radix-ui/react-icons";
import type { Simulation } from "osu-renderer";
import type { LazerMod } from "osu-simulation";
import { AudioControls } from "./AudioControls";
import { OptionsPopup } from "./OptionsPopup";
import { useReplaySetup } from "../hooks/useReplaySetup";
import { stepTo, useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { usePlayerSettings } from "../hooks/usePlayerSettings";
import type { JudgementMark } from "../lib/score-summary";

// osu! default combo colors, used only if neither the selected skin nor the
// bundled default skin define any in their skin.ini.
const DEFAULT_COMBO_COLORS = [0xffc000, 0x00ca00, 0x127cff, 0xf21839];

export type PlayerHandle = {
  seek: (timeSeconds: number) => void;
  currentTime: () => number;
};

function LoadingRow({ label, progress, done }: { label: string; progress: number; done: boolean }) {
  return (
    <Flex align="center" gap="2">
      <Text size="2" style={{ color: "white", width: 64 }}>
        {label}
      </Text>
      <Progress value={progress} size="2" style={{ flex: 1 }} />
      <Flex align="center" justify="center" style={{ width: 16, height: 16, flexShrink: 0 }}>
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
  mods,
  autoplay = false,
  initialTime,
  mediaPath,
  bgUrl,
  skins,
  marks,
  handleRef,
}: {
  scoreId: string;
  beatmapUrl: string;
  beatmapSetId: number;
  simulation: Simulation;
  mods: LazerMod[];
  autoplay?: boolean;
  initialTime?: number;
  mediaPath: string;
  bgUrl: string;
  skins: { id: string; name: string; comboColors: number[]; version?: string }[];
  marks: JudgementMark[];
  handleRef: Ref<PlayerHandle>;
}) {
  const { skin } = useSearch({ from: "/score/$scoreId" });
  const containerRef = useRef<HTMLDivElement>(null);
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const { settings, update: updateSettings, reset: resetSettings } = usePlayerSettings();

  // The version changes when a skin is re-ingested, so cached copies aren't reused.
  const skinFileUrl = (id: string) => {
    const version = skins.find((s) => s.id === id)?.version;
    return `${mediaPath}/skins/${id}.osk${version ? `?v=${version}` : ""}`;
  };
  const skinUrl = skinFileUrl(skin);

  // Combo colors for the selected skin, falling back to the default skin's, then
  // to osu!'s defaults (used when "use beatmap combo colors" is off).
  const selectedSkinColors = skins.find((s) => s.id === skin)?.comboColors ?? [];
  const defaultSkinColors = skins.find((s) => s.id === "default")?.comboColors ?? [];
  const skinComboColors = selectedSkinColors.length
    ? selectedSkinColors
    : defaultSkinColors.length
      ? defaultSkinColors
      : DEFAULT_COMBO_COLORS;

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
    loadError,
    beatmapComboColorsRef,
    simulationFramesRef,
    hitObjectTimesRef,
    seekTo,
    setVolume,
    setEffectsVolume,
    applyPlaybackRate,
  } = useReplaySetup({
    scoreId,
    beatmapUrl,
    beatmapSetId,
    simulation,
    mods,
    mediaPath,
    containerRef,
    autoplay,
    skinUrl,
    fallbackSkinUrl: skinFileUrl("default"),
  });

  useImperativeHandle(
    handleRef,
    () => ({
      seek: (timeSeconds: number) => {
        seekTo(timeSeconds);
        wrapper?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      currentTime: () => audioRef.current?.currentTime ?? 0,
    }),
    [seekTo, wrapper, audioRef],
  );

  function toggleFullscreen() {
    if (!wrapper) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapper.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    }
  }

  useKeyboardShortcuts(audioRef, seekTo, simulationFramesRef, hitObjectTimesRef, toggleFullscreen);

  useEffect(() => {
    const update = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

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
    if (!audio) return;
    const sync = () => setIsPaused(audio.paused);
    sync();
    audio.addEventListener("play", sync);
    audio.addEventListener("pause", sync);
    return () => {
      audio.removeEventListener("play", sync);
      audio.removeEventListener("pause", sync);
    };
  }, [audio]);

  const initialTimeRef = useRef(initialTime);
  useEffect(() => {
    if (!audio || initialTimeRef.current === undefined) return;
    seekTo(initialTimeRef.current);
    initialTimeRef.current = undefined;
  }, [audio, seekTo]);

  useEffect(() => {
    if (!audio) return;
    setVolume(settings.musicVolume);
    setEffectsVolume(settings.effectsVolume);
    applyPlaybackRate(settings.playbackSpeed);
    rendererRef.current?.setCursorAnalysis(settings.cursorAnalysis);
  }, [
    audio,
    settings.musicVolume,
    settings.effectsVolume,
    settings.playbackSpeed,
    settings.cursorAnalysis,
    setVolume,
    setEffectsVolume,
    applyPlaybackRate,
    rendererRef,
  ]);

  useEffect(() => {
    if (!audio) return;
    rendererRef.current?.setComboColors(
      settings.useBeatmapComboColors ? beatmapComboColorsRef.current : skinComboColors,
    );
  }, [audio, rendererRef, beatmapComboColorsRef, skinComboColors, settings.useBeatmapComboColors]);

  function handleViewerClick() {
    const currentAudio = audioRef.current;
    if (currentAudio) {
      if (currentAudio.paused) currentAudio.play();
      else currentAudio.pause();
    }
  }

  function handleStepObject(direction: -1 | 1) {
    const currentAudio = audioRef.current;
    if (currentAudio) stepTo(currentAudio, seekTo, hitObjectTimesRef.current, direction);
  }

  return (
    <>
      <style>{`
      .viewer-container {
        aspect-ratio: 16/9;
        background-image: url(${bgUrl});
        background-color: rgba(0, 0, 0, ${settings.backgroundDim});
        background-blend-mode: darken;
        background-size: cover;
        background-position: center;
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
      .play-overlay {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 88px;
        height: 88px;
        border-radius: 50%;
        border: 4px solid rgba(255, 255, 255, 0.9);
        background-color: color-mix(in oklab, var(--accent-9) 45%, transparent);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 150ms ease, background-color 150ms ease;
      }
      .play-overlay:hover {
        transform: translate(-50%, -50%) scale(1.06);
        background-color: color-mix(in oklab, var(--accent-9) 65%, transparent);
      }
      @media (max-width: 640px) {
        .play-overlay {
          width: 60px;
          height: 60px;
          border-width: 3px;
        }
      }
    `}</style>
      <div
        ref={setWrapper}
        className="fullscreen-wrapper"
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "var(--radius-5)",
          backgroundColor: "var(--gray-1)",
          border: "1px solid var(--accent-a5)",
        }}
      >
        <div style={{ position: "relative" }}>
          <div
            ref={containerRef}
            className="fullscreen-video viewer-container"
            onClick={handleViewerClick}
          />
          {audio && isPaused && !optionsOpen && (
            <button
              type="button"
              className="play-overlay"
              onClick={handleViewerClick}
              aria-label="Play replay"
            >
              <svg width="40%" height="40%" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M4 2v10l8.5-5z" fill="currentColor" />
              </svg>
            </button>
          )}
          {loadError && (
            <Flex
              align="center"
              justify="center"
              style={{ position: "absolute", inset: 0, zIndex: 10 }}
            >
              <Flex
                direction="column"
                gap="3"
                style={{
                  width: "min(340px, 85%)",
                  padding: "16px 20px",
                  borderRadius: "var(--radius-4)",
                  backgroundColor: "rgba(0, 0, 0, 0.75)",
                }}
              >
                <Text size="2" weight="bold" style={{ color: "white" }}>
                  {"Couldn't load this replay"}
                </Text>
                <Text size="2" style={{ color: "rgba(255, 255, 255, 0.8)" }}>
                  {loadError}
                </Text>
                <Button variant="soft" onClick={() => window.location.reload()}>
                  Try again
                </Button>
              </Flex>
            </Flex>
          )}
          {showLoadingUi && !loadError && (
            <Flex
              align="center"
              justify="center"
              style={{ position: "absolute", inset: 0, zIndex: 10 }}
            >
              <Flex
                direction="column"
                gap="3"
                style={{
                  width: "min(300px, 85%)",
                  padding: "16px 20px",
                  borderRadius: "var(--radius-4)",
                  backgroundColor: "rgba(0, 0, 0, 0.75)",
                }}
              >
                <Text size="2" weight="bold" style={{ color: "white" }}>
                  Loading replay
                </Text>
                <LoadingRow label="Beatmap" progress={beatmapProgress} done={beatmapLoaded} />
                <LoadingRow label="Audio" progress={audioProgress} done={audioLoaded} />
                <LoadingRow label="Skin" progress={skinProgress} done={skinLoaded} />
              </Flex>
            </Flex>
          )}
          <OptionsPopup
            open={optionsOpen}
            onClose={() => setOptionsOpen(false)}
            settings={settings}
            onChange={updateSettings}
            onReset={resetSettings}
            skins={skins}
            portalContainer={isFullscreen ? wrapper : null}
          />
        </div>
        <div
          className="fullscreen-controls"
          style={{
            zIndex: 20,
            backgroundColor: "color-mix(in oklab, var(--accent-3) 70%, transparent)",
            borderTop: "1px solid var(--accent-a5)",
            backdropFilter: "blur(8px)",
          }}
        >
          <AudioControls
            audio={audio}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onOptionsClick={() => setOptionsOpen(true)}
            onSeek={seekTo}
            onStepObject={handleStepObject}
            marks={marks}
            playbackSpeed={settings.playbackSpeed}
            onPlaybackSpeedChange={(playbackSpeed) => updateSettings({ playbackSpeed })}
            portalContainer={isFullscreen ? wrapper : null}
          />
        </div>
      </div>
    </>
  );
}
