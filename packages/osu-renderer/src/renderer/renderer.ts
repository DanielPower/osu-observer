import { HitResult } from "osu-classes";
import {
  calcPreempt,
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
import { drawHitCircle } from "./hitcircle";
import { drawSpinner } from "./spinner";
import { createSlider, drawSlider, rebuildSliderBody } from "./slider";
import type { SliderState } from "./slider";
import { drawSprite } from "./draw";
import { loadSkinFiles } from "../skin-loader";
import {
  loadSkinImages,
  skinFilesToImageUrls,
  skinFilesToSoundUrls,
  skinImageSize,
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
import { drawCursor } from "./cursor";

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
      continue;
    }

    if (hitObject.type & HIT_TYPE_NEW_COMBO) {
      hitColorIndex += 1;
      hitCircleNumber = 1;
    }

    const hitObjectX = hitObject.x * scale + offsetX;
    const hitObjectY = hitObject.y * scale + offsetY;

    if (hitObject.type & HIT_TYPE_SLIDER) {
      const state = createSlider({
        x: hitObjectX,
        y: hitObjectY,
        time: hitObject.time,
        endTime: hitObject.endTime!,
        number: hitCircleNumber,
        comboColorIndex: hitColorIndex,
        comboColors,
        radius: objectRadius,
        preempt,
        sliderData: extractSliderData(beatmap.hitObjects[i] as Slider),
        scale,
        offsetX,
        offsetY,
      });

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
    hitCircleNumber += 1;
  }

  renderObjects.reverse();

  // Largest gap between an object's hitTime and when it stops being visible.
  // Precomputed once so the update loop can binary-search for the trailing
  // bound rather than iterating the entire list.
  const maxTrailingTime = renderObjects.reduce((max, entry) => {
    const lastVisible =
      entry.kind === "circle" ? entry.hitObject.resultTime : entry.hitObject.endTime!;
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

  const widgetInstances: Widget[] = widgetConfigs.map(({ x, y, anchor, widget }) => {
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
    };
    return widget(context);
  });

  const resultImage = (result: HitResult): ImageBitmap | undefined =>
    (
      ({
        [HitResult.Good]: images.hit100,
        [HitResult.Ok]: images.hit100,
        [HitResult.Meh]: images.hit50,
        [HitResult.Great]: images.hit300,
        [HitResult.Perfect]: images.hit300,
        [HitResult.Miss]: images.hit0,
        [HitResult.IgnoreMiss]: images.sliderendmiss,
      }) as Record<number, ImageBitmap | undefined>
    )[result];

  let cursorAnalysisEnabled = false;
  let lastTime = 0;

  const update = (time: number): void => {
    lastTime = time;
    ctx.clearRect(0, 0, width, height);

    const { frames } = simulation;
    const nextFrameIdx = frameIndexAt(frames, time);
    const lastFrameIdx = frames.length - 1;
    const cursorFrameIdx = nextFrameIdx > 0 ? nextFrameIdx - 1 : lastFrameIdx;
    const currentFrame = frameAt(frames, cursorFrameIdx);

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
        const sliderEnd = entry.hitObject.endTime!;
        if (time < entry.hitObject.time - preempt || time > sliderEnd) continue;
        const alpha = calcFadeInAlpha(
          time,
          beatmap.difficulty.approachRate,
          entry.hitObject,
          hiddenMod,
        );
        const isTracking =
          currentFrame.activeSliderProgress !== undefined &&
          time >= entry.hitObject.time &&
          time <= sliderEnd;
        drawSlider(ctx, images, entry.state, time, alpha, hiddenMod, isTracking);
      } else {
        if (time < entry.hitObject.time - preempt || time > entry.hitObject.resultTime) continue;
        const alpha = calcAlpha(time, beatmap.difficulty.approachRate, entry.hitObject, hiddenMod);
        drawHitCircle(ctx, images, {
          x: entry.x,
          y: entry.y,
          hitTime: entry.hitObject.time,
          currentTime: time,
          radius: objectRadius,
          preempt,
          number: entry.number,
          color: comboColors[entry.comboColorIndex % comboColors.length],
          alpha,
          hidden: hiddenMod,
        });
      }
    }

    // Cursor analysis shows its own judgement markers in place of the skin's.
    if (!cursorAnalysisEnabled) {
      for (const entry of hitResults) {
        if (time < entry.time || time > entry.time + 200) continue;

        const img = resultImage(entry.result);
        if (img) {
          const fadeAlpha = 1 - (time - entry.time) / 200;
          const size = skinImageSize(img);
          drawSprite(
            ctx,
            img,
            entry.x,
            entry.y,
            size.width * scale * 0.5,
            size.height * scale * 0.5,
            fadeAlpha,
          );
        }
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

    drawCursor(ctx, images, cx, cy, cursorScale);

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
    const [newImages] = await Promise.all([
      loadSkinImages(skinFilesToImageUrls(files)),
      hitsounds.loadSounds(skinFilesToSoundUrls(files)),
    ]);
    // Mutate the shared object in-place rather than rebinding `images`.
    // Widget instances hold a reference to this object, so they see updates
    // without needing to be recreated.
    for (const key of Object.keys(images)) {
      delete (images as Record<string, unknown>)[key];
    }
    Object.assign(images, newImages);
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
