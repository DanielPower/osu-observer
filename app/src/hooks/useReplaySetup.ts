import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  accuracyWidget,
  createRenderer,
  scoreWidget,
  type Renderer,
  type SimulatedFrame,
  type Simulation,
} from "osu-renderer";
import { StandardRuleset } from "osu-standard-stable";
import { readBeatmap, readAudio } from "../lib/osu-files";

export function useReplaySetup({
  scoreId,
  beatmapUrl,
  beatmapSetId,
  mediaPath,
  simulation,
  rawMods,
  containerRef,
  autoplay,
  skinUrl,
}: {
  scoreId: string;
  beatmapUrl: string;
  beatmapSetId: number;
  mediaPath: string;
  simulation: Simulation;
  rawMods: number;
  containerRef: RefObject<HTMLDivElement | null>;
  autoplay: boolean;
  skinUrl: string;
}) {
  const rendererRef = useRef<Renderer | null>(null);
  const skinUrlRef = useRef(skinUrl);
  skinUrlRef.current = skinUrl;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const beatmapComboColorsRef = useRef<number[]>([]);
  const basePlaybackRateRef = useRef(1);
  const simulationFramesRef = useRef<SimulatedFrame[]>([]);
  const hitObjectTimesRef = useRef<number[]>([]);

  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  useEffect(() => {
    let cancelled = false;
    const standard = new StandardRuleset();

    const container = containerRef.current;

    const init = async () => {
      const beatmap = await readBeatmap(beatmapUrl);

      // Hack for old beatmaps that don't have beatmapSetId set
      beatmap.metadata.beatmapSetId = beatmapSetId;

      const modCombination = standard.createModCombination(rawMods);

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
        hiddenMod: modCombination.has("HD"),
        widgets: [
          { x: 5, y: 5, anchor: "top-right", origin: "top-right", widget: scoreWidget },
          { x: 5, y: 20, anchor: "top-right", origin: "top-right", widget: accuracyWidget },
        ],
      });
      if (cancelled) {
        renderer.destroy();
        return;
      }

      rendererRef.current = renderer;
      renderer.setSkin(skinUrlRef.current);
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
    };
  }, [scoreId, beatmapUrl, beatmapSetId, simulation, rawMods, mediaPath, containerRef]);

  useEffect(() => {
    rendererRef.current?.setSkin(skinUrl);
  }, [skinUrl]);

  return {
    rendererRef,
    audioRef,
    audio,
    beatmapComboColorsRef,
    basePlaybackRateRef,
    simulationFramesRef,
    hitObjectTimesRef,
  };
}
