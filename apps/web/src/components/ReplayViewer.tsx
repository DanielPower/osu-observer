import { useEffect, useRef, useState, useCallback } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  simulateScore,
  createRenderer,
  updateSkinTextures,
  type Renderer,
} from "osu-renderer";
import { StandardModCombination, StandardRuleset } from "osu-standard-stable";
import { readBeatmap, readScore, readAudio } from "../lib/osu-files";
import { AudioControls } from "./AudioControls";
import { OptionsPopup } from "./OptionsPopup";

const MEDIA_URL =
  import.meta.env.VITE_MEDIA_URL || "/api/media";

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
  beatmapId,
  beatmapSetId,
}: {
  scoreId: string;
  beatmapId: string;
  beatmapSetId: string;
}) {
  const { skin } = useSearch({ from: "/score/$scoreId" });
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [framerate, setFramerate] = useState(0);
  const [mods, setMods] = useState<StandardModCombination | null>(null);
  const [backgroundDim, setBackgroundDim] = useState(0.5);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [useBeatmapComboColors, setUseBeatmapComboColors] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [cursorAnalysis, setCursorAnalysis] = useState(false);
  const beatmapComboColorsRef = useRef<number[]>([]);
  const basePlaybackRateRef = useRef(1);

  // Initialize replay
  useEffect(() => {
    let cancelled = false;
    const standard = new StandardRuleset();

    const init = async () => {
      const beatmap = await readBeatmap(
        `${MEDIA_URL}/beatmaps/${beatmapSetId}/${beatmapId}.osu`,
      );
      const score = await readScore(`${MEDIA_URL}/scores/${scoreId}.osr`);
      if (!score.replay) throw new Error("No replay data found");
      if (cancelled) return;

      const modCombination = standard.createModCombination(score.info.rawMods);
      setMods(modCombination);

      const audioElement = await readAudio(
        `${MEDIA_URL}/beatmaps/${beatmapSetId}/${beatmap.general.audioFilename}`,
      );
      if (cancelled) return;

      audioElement.volume = 0.5;
      const baseRate =
        modCombination.has("DT") || modCombination.has("NC") ? 3 / 2 : 1;
      basePlaybackRateRef.current = baseRate;
      audioElement.playbackRate = baseRate;
      audioRef.current = audioElement;
      setAudio(audioElement);

      const standardBeatmap = standard.applyToBeatmapWithMods(
        beatmap,
        modCombination,
      );
      const standardReplay = standard.applyToReplay(score.replay);
      const simulation = simulateScore(standardReplay, standardBeatmap);

      beatmapComboColorsRef.current = standardBeatmap.colors.comboColors.map(
        (c) => (c.red << 16) + (c.green << 8) + c.blue,
      );

      const renderer = await createRenderer({
        beatmap: standardBeatmap,
        replay: standardReplay,
        simulation,
        width: 1920,
        height: 1080,
        mediaPath: MEDIA_URL,
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      renderer.setBackgroundDim(backgroundDim);
      rendererRef.current = renderer;
      containerRef.current?.appendChild(renderer.canvas);

      let lastAudioTime = 0;
      let lastPerformanceTime = 0;
      let lastFpsUpdate = 0;
      let frameCount = 0;
      let time = 0;

      renderer.app.ticker.add(() => {
        const now = performance.now();
        const delta = now - lastPerformanceTime;
        lastPerformanceTime = now;

        const audioTimeMs = audioElement.currentTime * 1000;
        if (audioTimeMs !== lastAudioTime) {
          time = audioTimeMs;
          lastAudioTime = audioTimeMs;
        } else if (!audioElement.paused) {
          time += delta * audioElement.playbackRate;
        }

        frameCount++;
        if (now - lastFpsUpdate >= 100) {
          setFramerate((frameCount * 1000) / (now - lastFpsUpdate));
          lastFpsUpdate = now;
          frameCount = 0;
        }

        renderer.update(time);
      });
    };

    init();

    return () => {
      cancelled = true;
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
        audioRef.current = null;
      }
      setAudio(null);
    };
  }, [scoreId, beatmapId, beatmapSetId]);

  useEffect(() => {
    const base = `${MEDIA_URL}/skins/${skin}`;
    updateSkinTextures({
      cursor: `${base}/cursor.png`,
      hitcircle: `${base}/hitcircle.png`,
      hitcircleoverlay: `${base}/hitcircleoverlay.png`,
      approachcircle: `${base}/approachcircle.png`,
      "spinner-bottom": `${base}/spinner-bottom.png`,
      "spinner-middle": `${base}/spinner-middle.png`,
      "spinner-top": `${base}/spinner-top.png`,
      "spinner-approachcircle": `${base}/spinner-approachcircle.png`,
      sliderb: `${base}/sliderb.png`,
      sliderfollowcircle: `${base}/sliderfollowcircle.png`,
      reversearrow: `${base}/reversearrow.png`,
      sliderscorepoint: `${base}/sliderscorepoint.png`,
      sliderstartcircle: `${base}/sliderstartcircle.png`,
      sliderstartcircleoverlay: `${base}/sliderstartcircleoverlay.png`,
      sliderendcircle: `${base}/sliderendcircle.png`,
      sliderendcircleoverlay: `${base}/sliderendcircleoverlay.png`,
      hit0: `${base}/hit0.png`,
      hit50: `${base}/hit50.png`,
      hit100: `${base}/hit100.png`,
      hit300: `${base}/hit300.png`,
    });
  }, [skin]);

  // Update combo colors when skin changes and using skin colors
  useEffect(() => {
    if (!useBeatmapComboColors) {
      const skinColors = SKIN_COMBO_COLORS[skin] ?? SKIN_COMBO_COLORS.default;
      rendererRef.current?.setComboColors(skinColors);
    }
  }, [skin, useBeatmapComboColors]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentAudio = audioRef.current;
      if (!currentAudio) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (currentAudio.paused) currentAudio.play();
        else currentAudio.pause();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        currentAudio.currentTime = Math.max(0, currentAudio.currentTime - 5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        currentAudio.currentTime = Math.min(
          currentAudio.duration,
          currentAudio.currentTime + 5,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleBackgroundDimChange = useCallback((newDim: number) => {
    setBackgroundDim(newDim);
    rendererRef.current?.setBackgroundDim(newDim);
  }, []);

  const handleUseBeatmapComboColorsChange = useCallback(
    (value: boolean) => {
      setUseBeatmapComboColors(value);
      if (value) {
        rendererRef.current?.setComboColors(beatmapComboColorsRef.current);
      } else {
        const skinColors = SKIN_COMBO_COLORS[skin] ?? SKIN_COMBO_COLORS.default;
        rendererRef.current?.setComboColors(skinColors);
      }
    },
    [skin],
  );

  const handleCursorAnalysisChange = useCallback((enabled: boolean) => {
    setCursorAnalysis(enabled);
    rendererRef.current?.setCursorAnalysis(enabled);
  }, []);

  const handlePlaybackSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = basePlaybackRateRef.current * speed;
    }
  }, []);

  const handleViewerClick = useCallback(() => {
    const currentAudio = audioRef.current;
    if (currentAudio) {
      if (currentAudio.paused) currentAudio.play();
      else currentAudio.pause();
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="fullscreen-wrapper relative overflow-hidden rounded-xl bg-slate-950 shadow-2xl"
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
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .viewer-container canvas {
          display: block;
          max-width: 100%;
          height: auto;
        }
      `}</style>
      {framerate.toFixed(1)} fps
      <div className="relative">
        <div
          ref={containerRef}
          className="fullscreen-video viewer-container flex items-center justify-center"
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
        <div className="fullscreen-controls z-20">
          <AudioControls
            audio={audio}
            fullscreenContainer={wrapperRef.current}
            onOptionsClick={() => setOptionsOpen(true)}
          />
        </div>
      )}
      {mods &&
        mods.all.map((mod) => {
          const assetName =
            modAssetNames[mod.acronym as keyof typeof modAssetNames];
          if (!assetName) return null;
          return (
            <img
              key={mod.acronym}
              src={`${MEDIA_URL}/skins/${skin}/${assetName}`}
              alt={mod.name}
            />
          );
        })}
    </div>
  );
}
