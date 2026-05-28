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
import type { HitObject, Simulation } from "osu-simulation";
import { StandardBeatmap } from "osu-standard-stable";
import { drawHitCircle } from "./hitcircle";
import { drawSpinner } from "./spinner";
import { createSlider, drawSlider, rebuildSliderBody } from "./slider";
import type { SliderState } from "./slider";
import { drawSprite } from "./draw";
import { loadSkinFiles } from "../skin-loader";
import { loadSkinImages, skinFilesToImageUrls, type SkinImages, type SkinKey } from "../skin";
import {
  resolvePosition,
  type Widget,
  type WidgetConfig,
  type WidgetContext,
} from "../widgets/widget";
import { createCursorAnalysis, type CursorAnalysis } from "./cursor-analysis";
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

type HitResultEntry = {
  hitObject: HitObject;
  x: number;
  y: number;
};

export type Renderer = {
  canvas: HTMLCanvasElement;
  update: (time: number) => void;
  setComboColors: (colors: number[]) => void;
  setCursorAnalysis: (enabled: boolean) => void;
  setSkin: (skinUrl: string) => Promise<void>;
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
  textures?: Partial<Record<SkinKey, string>>;
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

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;

  const renderObjects: RenderEntry[] = [];
  const hitResults: HitResultEntry[] = [];

  let hitColorIndex = 0;
  let hitCircleNumber = 1;

  for (const hitObject of simulation.hitObjects) {
    if (hitObject.type & HIT_TYPE_SPINNER) {
      renderObjects.push({ kind: "spinner", hitObject });
      hitResults.push({ hitObject, x: width / 2, y: height / 2 });
      continue;
    }

    if (hitObject.type & HIT_TYPE_NEW_COMBO) {
      hitColorIndex += 1;
      hitCircleNumber = 1;
    }

    const hitObjectX = hitObject.x * scale + offsetX;
    const hitObjectY = hitObject.y * scale + offsetY;

    if (hitObject.type & HIT_TYPE_SLIDER && hitObject.slider) {
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
        sliderData: hitObject.slider,
        scale,
        offsetX,
        offsetY,
      });

      renderObjects.push({ kind: "slider", hitObject, state, comboColorIndex: hitColorIndex });
      hitResults.push({ hitObject, x: hitObjectX, y: hitObjectY });
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
    hitResults.push({ hitObject, x: hitObjectX, y: hitObjectY });
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
    scale,
    offsetX,
    offsetY,
  });

  const widgetInstances: Widget[] = widgetConfigs.map(({ x, y, anchor, widget }) => {
    const pos = resolvePosition(anchor, x, y, width, height, scale);
    const context: WidgetContext = {
      scale,
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
      }) as Record<number, ImageBitmap | undefined>
    )[result];

  const update = (time: number): void => {
    ctx.clearRect(0, 0, width, height);

    const nextFrameIdx = partitionPoint(
      simulation.frames,
      0,
      simulation.frames.length,
      (f) => f.time <= time,
    );
    const currentFrame =
      simulation.frames[nextFrameIdx - 1] ?? simulation.frames[simulation.frames.length - 1];

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

    for (const entry of hitResults) {
      const resultTime = entry.hitObject.endTime ?? entry.hitObject.resultTime;
      if (time < resultTime || time > resultTime + 200) continue;

      const img = resultImage(entry.hitObject.result);
      if (img) {
        const fadeAlpha = 1 - (time - resultTime) / 200;
        drawSprite(
          ctx,
          img,
          entry.x,
          entry.y,
          img.width * scale * 0.5,
          img.height * scale * 0.5,
          fadeAlpha,
        );
      }
    }

    cursorAnalysis.draw(ctx, time);

    const cursorFrame =
      simulation.frames[nextFrameIdx - 1] ?? simulation.frames[simulation.frames.length - 1];
    const nextFrame =
      simulation.frames[nextFrameIdx] ?? simulation.frames[simulation.frames.length - 1];

    const { x: cursorX, y: cursorY } = lerp2D(
      cursorFrame.time,
      cursorFrame.x,
      cursorFrame.y,
      nextFrame.time,
      nextFrame.x,
      nextFrame.y,
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
    cursorAnalysis.setVisible(enabled);
  };

  const setSkin = async (skinUrl: string): Promise<void> => {
    const files = await loadSkinFiles(skinUrl);
    const imageUrls = skinFilesToImageUrls(files);
    const newImages = await loadSkinImages(imageUrls);
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
    setSkin,
  };
};
