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
} from "../math";
import type { HitObject, SimulatedFrame, Simulation } from "osu-simulation";
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

type CircleEntry = {
  hitObject: HitObject;
  x: number;
  y: number;
  number: number;
  comboColorIndex: number;
};

type SliderEntry = {
  hitObject: HitObject;
  state: SliderState;
  comboColorIndex: number;
};

type SpinnerEntry = {
  hitObject: HitObject;
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

function findNextFrameIndex(frames: SimulatedFrame[], targetTime: number): number {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].time > targetTime) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
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

  const circles: CircleEntry[] = [];
  const sliders: SliderEntry[] = [];
  const spinners: SpinnerEntry[] = [];
  const hitResults: HitResultEntry[] = [];

  let hitColorIndex = 0;
  let hitCircleNumber = 1;

  for (const hitObject of simulation.hitObjects) {
    if (hitObject.type & HIT_TYPE_SPINNER) {
      spinners.push({ hitObject });
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

      sliders.push({ hitObject, state, comboColorIndex: hitColorIndex });
      hitResults.push({ hitObject, x: hitObjectX, y: hitObjectY });
      hitCircleNumber += 1;
      continue;
    }

    circles.push({
      hitObject,
      x: hitObjectX,
      y: hitObjectY,
      number: hitCircleNumber,
      comboColorIndex: hitColorIndex,
    });
    hitResults.push({ hitObject, x: hitObjectX, y: hitObjectY });
    hitCircleNumber += 1;
  }

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

    // Current frame for spinner rotation and cursor interpolation.
    const nextFrameIdx = findNextFrameIndex(simulation.frames, time);
    const currentFrame =
      simulation.frames[nextFrameIdx - 1] ?? simulation.frames[simulation.frames.length - 1];

    // ── Collect visible objects into one sorted list ──────────────────────────
    // z-order: objects with higher hitTime are drawn first (behind);
    // objects with lower hitTime are drawn last (in front).

    type DrawItem =
      | { hitTime: number; kind: "spinner"; entry: SpinnerEntry }
      | { hitTime: number; kind: "slider"; entry: SliderEntry; alpha: number; isTracking: boolean }
      | { hitTime: number; kind: "circle"; entry: CircleEntry; alpha: number };

    const drawList: DrawItem[] = [];

    for (const entry of spinners) {
      if (time >= entry.hitObject.time && time <= entry.hitObject.endTime!) {
        drawList.push({ hitTime: entry.hitObject.time, kind: "spinner", entry });
      }
    }

    for (const entry of sliders) {
      const sliderEnd = entry.hitObject.endTime!;
      if (time >= entry.hitObject.time - preempt && time <= sliderEnd) {
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
        drawList.push({ hitTime: entry.hitObject.time, kind: "slider", entry, alpha, isTracking });
      }
    }

    for (const entry of circles) {
      if (time >= entry.hitObject.time - preempt && time <= entry.hitObject.resultTime) {
        const alpha = calcAlpha(time, beatmap.difficulty.approachRate, entry.hitObject, hiddenMod);
        drawList.push({ hitTime: entry.hitObject.time, kind: "circle", entry, alpha });
      }
    }

    // Sort descending by hit time: later objects render first (behind earlier ones).
    drawList.sort((a, b) => b.hitTime - a.hitTime);

    for (const item of drawList) {
      if (item.kind === "spinner") {
        const { hitObject } = item.entry;
        const rotation = currentFrame.currentSpinnerRotation ?? 0;
        drawSpinner(
          ctx,
          images,
          {
            x: width / 2,
            y: height / 2,
            startTime: hitObject.time,
            endTime: hitObject.endTime!,
            radius: 100 * scale,
            scale,
            overallDifficulty: beatmap.difficulty.overallDifficulty,
          },
          time,
          rotation,
        );
      } else if (item.kind === "slider") {
        drawSlider(ctx, images, item.entry.state, time, item.alpha, hiddenMod, item.isTracking);
      } else if (item.kind === "circle") {
        const { entry, alpha } = item;
        const color = comboColors[entry.comboColorIndex % comboColors.length];
        drawHitCircle(ctx, images, {
          x: entry.x,
          y: entry.y,
          hitTime: entry.hitObject.time,
          currentTime: time,
          radius: objectRadius,
          preempt,
          number: entry.number,
          color,
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
    for (const entry of sliders) {
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
