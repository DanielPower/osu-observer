import { HitResult } from "osu-classes";
import {
  calcPreempt,
  calcFade,
  calcObjectRadius,
  calcAlpha,
  calcFadeInAlpha,
  lerp2D,
  calcCursorSize,
  PLAYFIELD,
  GAME,
  partitionPoint,
} from "../math";
import {
  extractSliderData,
  frameAt,
  frameIndexAt,
  type HitObject,
  type Simulation,
} from "osu-simulation";
import { type Slider, StandardBeatmap } from "osu-standard-stable";
import { circleVisible, drawApproachCircle, drawHitCircle } from "./hitcircle";
import { drawSpinner } from "./spinner";
import {
  createSlider,
  drawSlider,
  drawSliderApproachCircle,
  rebuildSliderBody,
  SLIDER_FADE_OUT,
  sliderVisible,
} from "./slider";
import type { SliderState } from "./slider";
import {
  drawJudgement,
  drawLighting,
  JUDGEMENT_DURATION,
  LIGHTING_DURATION,
  type JudgementEntry,
} from "./judgement";
import { loadSkinFiles } from "../skin-loader";
import {
  DEFAULT_HIT_OBJECT_CONFIG,
  loadSkinImages,
  parseCursorConfig,
  parseHitObjectConfig,
  skinFilesToImageUrls,
  skinFilesToSoundUrls,
  type HitObjectConfig,
  type SkinImageSource,
  type SkinImages,
  type SkinKey,
} from "../skin";
import { createHitsoundEngine } from "../hitsounds";
import {
  resolvePosition,
  type Widget,
  type WidgetConfig,
  type WidgetContext,
} from "../widgets/widget";
import {
  createCursorAnalysis,
  type AnalysisJudgement,
  type CursorAnalysis,
  type JudgementMarker,
} from "./cursor-analysis";
import { createCursor } from "./cursor";
import { createSmoke } from "./smoke";

const HIT_TYPE_SLIDER = 1 << 1;
const HIT_TYPE_NEW_COMBO = 1 << 2;
const HIT_TYPE_SPINNER = 1 << 3;

type RenderEntry =
  | { kind: "spinner"; hitObject: HitObject }
  | { kind: "slider"; hitObject: HitObject; state: SliderState; comboColorIndex: number }
  | {
      kind: "circle";
      hitObject: HitObject;
      x: number;
      y: number;
      number: number;
      comboColorIndex: number;
    };

type HitResultEntry = AnalysisJudgement;

/** A judgement drawn from the skin, with the combo colour its hit lighting takes. */
type SkinJudgement = Omit<JudgementEntry, "color"> & { comboColorIndex: number };

/** When the player starts tracking a slider, each time, from the simulated frames. */
function trackingStartsFor(frames: Simulation["frames"], start: number, end: number): number[] {
  const starts: number[] = [];
  let tracking = false;
  for (let i = Math.max(0, frameIndexAt(frames, start) - 1); i < frames.length; i++) {
    const time = frames.time[i];
    if (time >= end) break;
    const now = !Number.isNaN(frames.activeSliderProgress[i]);
    if (now && !tracking) starts.push(Math.max(time, start));
    tracking = now;
  }
  return starts;
}

export type Renderer = {
  canvas: HTMLCanvasElement;
  update: (time: number) => void;
  setComboColors: (colors: number[]) => void;
  setCursorAnalysis: (enabled: boolean) => void;
  /**
   * The cursor analysis judgement marker nearest canvas point (x, y) as last
   * drawn, if one is close. Always undefined while cursor analysis is off.
   */
  markerAt: (x: number, y: number) => JudgementMarker | undefined;
  setSkin: (skinUrl: string) => Promise<void>;
  setAudio: (audio: HTMLAudioElement | null) => void;
  setEffectsVolume: (volume: number) => void;
  dispose: () => void;
};

function findVisibleRange(
  objects: RenderEntry[],
  time: number,
  preempt: number,
  maxTrailingTime: number,
): [number, number] {
  const start = partitionPoint(
    objects,
    0,
    objects.length,
    (e) => e.hitObject.time > time + preempt,
  );
  const end = partitionPoint(
    objects,
    start,
    objects.length,
    (e) => e.hitObject.time >= time - maxTrailingTime,
  );
  return [start, end];
}

export const createRenderer = async ({
  beatmap,
  simulation,
  width,
  height,
  textures: initialTextures = {},
  hiddenMod = false,
  widgets: widgetConfigs = [],
}: {
  beatmap: StandardBeatmap;
  simulation: Simulation;
  width: number;
  height: number;
  textures?: Partial<Record<SkinKey, string | SkinImageSource>>;
  hiddenMod?: boolean;
  widgets?: WidgetConfig[];
}): Promise<Renderer> => {
  const scale = height / GAME.height;
  const offsetX = ((GAME.width - PLAYFIELD.height) / 2) * (width / GAME.width);
  const offsetY = ((GAME.height - PLAYFIELD.height) / 2) * (height / GAME.height);
  const preempt = calcPreempt(beatmap.difficulty.approachRate);
  const fadeIn = calcFade(beatmap.difficulty.approachRate);
  const objectRadius = calcObjectRadius(beatmap.difficulty.circleSize) * scale;
  const cursorScale = calcCursorSize(beatmap.difficulty.circleSize);
  let comboColors = beatmap.colors.comboColors.map((c) => (c.red << 16) + (c.green << 8) + c.blue);
  const images: SkinImages = await loadSkinImages(initialTextures);

  const hitsounds = createHitsoundEngine({ beatmap, simulation });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;

  const renderObjects: RenderEntry[] = [];
  const hitResults: HitResultEntry[] = [];
  const judgements: SkinJudgement[] = [];
  let hitObjectConfig: HitObjectConfig = DEFAULT_HIT_OBJECT_CONFIG;
  // Canvas pixels per skin pixel for hit objects at this beatmap's circle size.
  const unit = objectRadius / 64;

  let hitColorIndex = 0;
  let hitCircleNumber = 1;

  for (let i = 0; i < simulation.hitObjects.length; i++) {
    const hitObject = simulation.hitObjects[i];
    if (hitObject.type & HIT_TYPE_SPINNER) {
      renderObjects.push({ kind: "spinner", hitObject });
      hitResults.push({
        hitObject,
        time: hitObject.endTime ?? hitObject.resultTime,
        result: hitObject.result,
        x: width / 2,
        y: height / 2,
        clicked: false,
      });
      judgements.push({
        time: hitObject.endTime ?? hitObject.resultTime,
        result: hitObject.result,
        x: width / 2,
        y: height / 2,
        comboColorIndex: hitColorIndex,
      });
      continue;
    }

    if (hitObject.type & HIT_TYPE_NEW_COMBO) {
      hitColorIndex += 1;
      hitCircleNumber = 1;
    }

    const hitObjectX = hitObject.x * scale + offsetX;
    const hitObjectY = hitObject.y * scale + offsetY;

    if (hitObject.type & HIT_TYPE_SLIDER) {
      const sliderData = extractSliderData(beatmap.hitObjects[i] as Slider);
      const state = createSlider({
        x: hitObjectX,
        y: hitObjectY,
        number: hitCircleNumber,
        comboColorIndex: hitColorIndex,
        comboColors,
        radius: objectRadius,
        preempt,
        fadeIn,
        sliderData,
        hitObject,
        trackingStarts: trackingStartsFor(simulation.frames, hitObject.time, hitObject.endTime!),
        scale,
        offsetX,
        offsetY,
      });
      judgements.push({
        time: hitObject.resultTime,
        result: hitObject.result,
        x: hitObjectX,
        y: hitObjectY,
        comboColorIndex: hitColorIndex,
      });
      // Missed ticks and repeats show slidertickmiss; a missed tail, sliderendmiss.
      const tickPositions = state.ticks.map((t) => ({ x: t.screenX, y: t.screenY }));
      const repeatPositions = state.repeats.map((r) => ({ x: r.screenX, y: r.screenY }));
      let tickIndex = 0;
      let repeatIndex = 0;
      for (const event of hitObject.sliderEvents ?? []) {
        const position =
          event.kind === "sliderTick"
            ? tickPositions[tickIndex++]
            : event.kind === "sliderRepeat"
              ? repeatPositions[repeatIndex++]
              : { x: state.endX, y: state.endY };
        if (event.hit || !position) continue;
        judgements.push({
          time: event.resultTime,
          result: event.kind === "sliderTail" ? HitResult.IgnoreMiss : HitResult.LargeTickMiss,
          x: position.x,
          y: position.y,
          comboColorIndex: hitColorIndex,
        });
      }

      renderObjects.push({ kind: "slider", hitObject, state, comboColorIndex: hitColorIndex });
      // The head's judgement shows on the head. A hit tail shows nothing, as in
      // lazer; a missed tail (lazer's IgnoreMiss) shows the skin's sliderendmiss.
      hitResults.push({
        hitObject,
        time: hitObject.resultTime,
        result: hitObject.result,
        x: hitObjectX,
        y: hitObjectY,
        clicked: hitObject.click !== undefined,
      });
      if (hitObject.endResult === HitResult.Miss) {
        hitResults.push({
          hitObject,
          time: hitObject.endResultTime ?? hitObject.endTime!,
          result: HitResult.IgnoreMiss,
          x: state.endX,
          y: state.endY,
          clicked: false,
        });
      }
      hitCircleNumber += 1;
      continue;
    }

    renderObjects.push({
      kind: "circle",
      hitObject,
      x: hitObjectX,
      y: hitObjectY,
      number: hitCircleNumber,
      comboColorIndex: hitColorIndex,
    });
    hitResults.push({
      hitObject,
      time: hitObject.resultTime,
      result: hitObject.result,
      x: hitObjectX,
      y: hitObjectY,
      clicked: hitObject.click !== undefined,
    });
    judgements.push({
      time: hitObject.resultTime,
      result: hitObject.result,
      x: hitObjectX,
      y: hitObjectY,
      comboColorIndex: hitColorIndex,
    });
    hitCircleNumber += 1;
  }

  judgements.sort((a, b) => a.time - b.time);

  renderObjects.reverse();

  // Largest gap between an object's hitTime and when it stops being visible.
  // Precomputed once so the update loop can binary-search for the trailing
  // bound rather than iterating the entire list.
  const maxTrailingTime = renderObjects.reduce((max, entry) => {
    const lastVisible =
      entry.kind === "circle"
        ? entry.hitObject.resultTime + SLIDER_FADE_OUT
        : entry.hitObject.endTime! + SLIDER_FADE_OUT;
    return Math.max(max, lastVisible - entry.hitObject.time);
  }, 0);

  const cursorAnalysis: CursorAnalysis = createCursorAnalysis({
    frames: simulation.frames,
    judgements: hitResults,
    radius: calcObjectRadius(beatmap.difficulty.circleSize),
    scale,
    offsetX,
    offsetY,
  });

  const cursor = createCursor({
    frames: simulation.frames,
    images,
    scale,
    offsetX,
    offsetY,
    cursorScale,
  });
  const smoke = createSmoke({ frames: simulation.frames, images, scale, offsetX, offsetY });

  const widgetInstances: Widget[] = widgetConfigs.map(({ x, y, anchor, origin, widget }) => {
    const pos = resolvePosition(anchor, x, y, width, height, scale);
    const context: WidgetContext = {
      scale: height / 768, // 1024x768 is the base resolution for skinning
      width,
      height,
      beatmap,
      simulation,
      images,
      canvasX: pos.x,
      canvasY: pos.y,
      origin,
    };
    return widget(context);
  });

  let cursorAnalysisEnabled = false;
  let lastTime = 0;

  const circleParams = (entry: Extract<RenderEntry, { kind: "circle" }>, time: number) => ({
    x: entry.x,
    y: entry.y,
    hitTime: entry.hitObject.time,
    resultTime: entry.hitObject.resultTime,
    result: entry.hitObject.result,
    shakes: entry.hitObject.shakes,
    currentTime: time,
    preempt,
    alpha: calcAlpha(time, beatmap.difficulty.approachRate, entry.hitObject, hiddenMod),
    number: entry.number,
    color: comboColors[entry.comboColorIndex % comboColors.length],
    hidden: hiddenMod,
    unit,
    config: hitObjectConfig,
  });

  const update = (time: number): void => {
    lastTime = time;
    ctx.clearRect(0, 0, width, height);

    const { frames } = simulation;
    const nextFrameIdx = frameIndexAt(frames, time);
    const lastFrameIdx = frames.length - 1;
    const cursorFrameIdx = nextFrameIdx > 0 ? nextFrameIdx - 1 : lastFrameIdx;
    const currentFrame = frameAt(frames, cursorFrameIdx);

    smoke.draw(ctx, time);

    const comboColor = (index: number) => comboColors[index % comboColors.length];
    // Judgements on screen now, from the time-sorted list.
    const judgementStart = partitionPoint(
      judgements,
      0,
      judgements.length,
      (j) => j.time < time - Math.max(JUDGEMENT_DURATION, LIGHTING_DURATION),
    );
    const judgementEnd = partitionPoint(
      judgements,
      judgementStart,
      judgements.length,
      (j) => j.time <= time,
    );
    // Cursor analysis shows its own judgement markers in place of the skin's.
    const showJudgements = !cursorAnalysisEnabled;

    // Hit lighting sits under the hit objects.
    if (showJudgements) {
      for (let i = judgementStart; i < judgementEnd; i++) {
        const j = judgements[i];
        drawLighting(ctx, images, { ...j, color: comboColor(j.comboColorIndex) }, time, unit);
      }
    }

    const [visStart, visEnd] = findVisibleRange(renderObjects, time, preempt, maxTrailingTime);
    for (let i = visStart; i < visEnd; i++) {
      const entry = renderObjects[i];
      if (entry.kind === "spinner") {
        if (time < entry.hitObject.time || time > entry.hitObject.endTime!) continue;
        drawSpinner(
          ctx,
          images,
          {
            x: width / 2,
            y: height / 2,
            startTime: entry.hitObject.time,
            endTime: entry.hitObject.endTime!,
            radius: 100 * scale,
            scale,
            overallDifficulty: beatmap.difficulty.overallDifficulty,
          },
          time,
          currentFrame.currentSpinnerRotation ?? 0,
        );
      } else if (entry.kind === "slider") {
        if (time < entry.hitObject.time - preempt || !sliderVisible(entry.state, time)) continue;
        const alpha = calcFadeInAlpha(
          time,
          beatmap.difficulty.approachRate,
          entry.hitObject,
          hiddenMod,
        );
        drawSlider(ctx, images, entry.state, time, alpha, hiddenMod, hitObjectConfig);
      } else {
        const { hitObject } = entry;
        if (time < hitObject.time - preempt) continue;
        if (!circleVisible(time, hitObject.resultTime, hitObject.result)) continue;
        drawHitCircle(ctx, images, circleParams(entry, time));
      }
    }

    // Approach circles go above every hit object, as lazer proxies them.
    for (let i = visStart; i < visEnd; i++) {
      const entry = renderObjects[i];
      if (time < entry.hitObject.time - preempt || time >= entry.hitObject.time + 50) continue;
      if (entry.kind === "slider") {
        drawSliderApproachCircle(ctx, images, entry.state, time, hiddenMod, hitObjectConfig);
      } else if (entry.kind === "circle") {
        drawApproachCircle(ctx, images, { ...circleParams(entry, time), fadeIn });
      }
    }

    if (showJudgements) {
      for (let i = judgementStart; i < judgementEnd; i++) {
        const j = judgements[i];
        drawJudgement(
          ctx,
          images,
          { ...j, color: comboColor(j.comboColorIndex) },
          time,
          unit,
          hitObjectConfig.version,
        );
      }
    }

    cursorAnalysis.draw(ctx, time);

    const nextIdx = nextFrameIdx <= lastFrameIdx ? nextFrameIdx : lastFrameIdx;
    const { x: cursorX, y: cursorY } = lerp2D(
      frames.time[cursorFrameIdx],
      frames.x[cursorFrameIdx],
      frames.y[cursorFrameIdx],
      frames.time[nextIdx],
      frames.x[nextIdx],
      frames.y[nextIdx],
      time,
    );

    const cx = cursorX * scale + offsetX;
    const cy = cursorY * scale + offsetY;

    cursor.draw(ctx, time, cx, cy);

    for (const widget of widgetInstances) {
      widget.draw(ctx, currentFrame, time);
    }
  };

  const setComboColors = (colors: number[]): void => {
    comboColors = colors;
    for (const entry of renderObjects) {
      if (entry.kind !== "slider") continue;
      const newColor = colors[entry.comboColorIndex % colors.length];
      if (entry.state.color !== newColor) {
        rebuildSliderBody(entry.state, newColor);
      }
    }
  };

  const setCursorAnalysis = (enabled: boolean): void => {
    cursorAnalysisEnabled = enabled;
    cursorAnalysis.setVisible(enabled);
  };

  const markerAt = (x: number, y: number): JudgementMarker | undefined =>
    cursorAnalysis.markerAt(x, y, lastTime);

  const setSkin = async (skinUrl: string): Promise<void> => {
    const files = await loadSkinFiles(skinUrl);
    const iniUrl = Object.entries(files).find(([name]) => name.toLowerCase() === "skin.ini")?.[1];
    const [newImages, , ini] = await Promise.all([
      loadSkinImages(skinFilesToImageUrls(files)),
      hitsounds.loadSounds(skinFilesToSoundUrls(files)),
      iniUrl
        ? fetch(iniUrl)
            .then((response) => response.text())
            .catch(() => null)
        : null,
    ]);
    cursor.setConfig(parseCursorConfig(ini));
    hitObjectConfig = parseHitObjectConfig(ini);
    // Mutate the shared object in-place rather than rebinding `images`.
    // Widget instances hold a reference to this object, so they see updates
    // without needing to be recreated.
    for (const key of Object.keys(images)) {
      delete (images as Record<string, unknown>)[key];
    }
    Object.assign(images, newImages);
    cursor.prepare();
    smoke.prepare();
  };

  return {
    canvas,
    update,
    setComboColors,
    setCursorAnalysis,
    markerAt,
    setSkin,
    setAudio: hitsounds.setAudio,
    setEffectsVolume: hitsounds.setEffectsVolume,
    dispose: hitsounds.dispose,
  };
};
