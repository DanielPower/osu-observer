import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createRenderer, type Renderer, type SimulatedFrame, type Simulation } from "osu-renderer";
import { StandardRuleset, type StandardModCombination } from "osu-standard-stable";
import { readBeatmap, readAudio } from "../lib/osu-files";

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

export function useReplaySetup({
  scoreId,
  beatmapUrl,
  beatmapSetId,
  mediaPath,
  bgUrl,
  simulation,
  rawMods,
  containerRef,
  autoplay,
  skin,
  backgroundDim,
}: {
  scoreId: string;
  beatmapUrl: string;
  beatmapSetId: number;
  mediaPath: string;
  bgUrl: string;
  simulation: Simulation;
  rawMods: number;
  containerRef: RefObject<HTMLDivElement | null>;
  autoplay: boolean;
  skin: string;
  backgroundDim: number;
}) {
  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [mods, setMods] = useState<StandardModCombination | null>(null);
  const beatmapComboColorsRef = useRef<number[]>([]);
  const basePlaybackRateRef = useRef(1);
  const simulationFramesRef = useRef<SimulatedFrame[]>([]);
  const hitObjectTimesRef = useRef<number[]>([]);

  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const skinRef = useRef(skin);
  skinRef.current = skin;
  const backgroundDimRef = useRef(backgroundDim);
  backgroundDimRef.current = backgroundDim;
  useEffect(() => {
    let cancelled = false;
    const standard = new StandardRuleset();

    const container = containerRef.current;

    const init = async () => {
      const beatmap = await readBeatmap(beatmapUrl);

      // Hack for old beatmaps that don't have beatmapSetId set
      beatmap.metadata.beatmapSetId = beatmapSetId;

      const modCombination = standard.createModCombination(rawMods);
      setMods(modCombination);

      const audioElement = await readAudio(
        `${mediaPath}/beatmaps/${beatmapSetId}/${beatmap.general.audioFilename}`,
      );
      if (cancelled) return;

      audioElement.volume = 0.5;
      const baseRate = modCombination.has("DT") || modCombination.has("NC") ? 3 / 2 : 1;
      basePlaybackRateRef.current = baseRate;
      audioElement.playbackRate = baseRate;
      audioRef.current = audioElement;
      setAudio(audioElement);
      if (autoplayRef.current) audioElement.play().catch(() => {});

      const standardBeatmap = standard.applyToBeatmapWithMods(beatmap, modCombination);
      simulationFramesRef.current = simulation.frames;
      hitObjectTimesRef.current = simulation.hitObjects.map((h) => h.resultTime);

      beatmapComboColorsRef.current = standardBeatmap.colors.comboColors.map(
        (c) => (c.red << 16) + (c.green << 8) + c.blue,
      );

      const renderer = await createRenderer({
        beatmap: standardBeatmap,
        simulation,
        width: 1920,
        height: 1080,
        bgUrl,
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      renderer.setBackgroundDim(backgroundDimRef.current);

      const modInfos = modCombination.all
        .map((mod) => {
          const assetName = modAssetNames[mod.acronym];
          if (!assetName) return null;
          return {
            acronym: mod.acronym,
            iconUrl: `${mediaPath}/skins/${skinRef.current}/${assetName}`,
          };
        })
        .filter((info): info is { acronym: string; iconUrl: string } => Boolean(info));
      renderer.setMods(modInfos);

      rendererRef.current = renderer;
      container?.appendChild(renderer.canvas);

      let lastAudioTime = 0;
      let lastPerformanceTime = 0;
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
      setMods(null);
    };
  }, [scoreId, beatmapUrl, beatmapSetId, simulation, rawMods, mediaPath, bgUrl, containerRef]);

  return {
    rendererRef,
    audioRef,
    audio,
    mods,
    beatmapComboColorsRef,
    basePlaybackRateRef,
    simulationFramesRef,
    hitObjectTimesRef,
  };
}
