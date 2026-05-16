import { HitResult } from "osu-classes";
import { Application, Assets, Container, Sprite, Text, Texture } from "pixi.js";
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
import { HitCircle } from "./hitcircle";
import { Spinner } from "./spinner";
import { SliderObject } from "./slider";
import { defaultSkin, type Skin } from "../skin";
import { createCursorAnalysis, type CursorAnalysis } from "./cursor-analysis";

/**
 * Binary search to find the index of the first frame with time > targetTime.
 * Returns frames.length if all frames have time <= targetTime.
 * Returns 0 if all frames have time > targetTime.
 */
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

// Bit flags from osu! hit types
const HIT_TYPE_SLIDER = 1 << 1;
const HIT_TYPE_NEW_COMBO = 1 << 2;
const HIT_TYPE_SPINNER = 1 << 3;

type Circle = {
  hitObject: HitObject;
  hitCircle: HitCircle;
  textureVersion: number;
  colorVersion: number;
};

type SliderRenderObject = {
  hitObject: HitObject;
  slider: SliderObject;
  textureVersion: number;
  colorVersion: number;
};

type SpinnerRenderObject = {
  hitObject: HitObject;
  spinner: Spinner;
  textureVersion: number;
};

type HitResultObject = {
  hitObject: HitObject;
  sprite: Sprite;
  textureVersion: number;
};

const getDebugText = (frame: SimulatedFrame) =>
  `Score: ${frame.score}
Combo: ${frame.combo}
Accuracy: ${(frame.accuracy * 100).toFixed(2)}%
300s: ${frame.great}
100s: ${frame.good}
50s: ${frame.okay}
Misses: ${frame.miss}`;

export type ModInfo = {
  acronym: string;
  iconUrl: string;
};

export type Renderer = {
  app: Application;
  canvas: HTMLCanvasElement;
  update: (time: number) => void;
  destroy: () => void;
  setComboColors: (colors: number[]) => void;
  setCursorAnalysis: (enabled: boolean) => void;
  setMods: (mods: ModInfo[]) => Promise<void>;
};

export const createRenderer = async ({
  beatmap,
  simulation,
  width,
  height,
  skin = defaultSkin,
}: {
  beatmap: StandardBeatmap;
  simulation: Simulation;
  width: number;
  height: number;
  skin?: Skin;
}): Promise<Renderer> => {
  const renderer = new Application();
  const scale = height / GAME.height;

  const offsetX = ((GAME.width - PLAYFIELD.height) / 2) * (width / GAME.width);
  const offsetY = ((GAME.height - PLAYFIELD.height) / 2) * (height / GAME.height);

  await renderer.init({ width, height, antialias: true, backgroundAlpha: 0 });

  const { textures } = skin;

  // Version counters for lazy updates — incremented on change,
  // each renderable tracks the version it last synced to.
  let textureVersion = 0;
  let colorVersion = 0;

  const preempt = calcPreempt(beatmap.difficulty.approachRate);
  const objectRadius = calcObjectRadius(beatmap.difficulty.circleSize) * scale;
  const cursor = new Sprite({
    texture: textures.cursor ?? Texture.EMPTY,
    scale: calcCursorSize(beatmap.difficulty.circleSize),
    anchor: 0.5,
  });
  renderer.stage.addChild(cursor);

  const debugText = new Text({
    text: 0,
    style: {
      fill: 0xffffff,
      fontSize: 16 * scale,
    },
  });
  renderer.stage.addChild(debugText);

  const circles: Circle[] = [];
  const sliders: SliderRenderObject[] = [];
  const spinners: SpinnerRenderObject[] = [];
  const hitResults: HitResultObject[] = [];

  const setComboColors = (colors: number[]) => {
    comboColors = colors;
    colorVersion++;
  };

  let cursorAnalysis: CursorAnalysis | null = null;
  if (simulation) {
    cursorAnalysis = createCursorAnalysis({
      frames: simulation.frames,
      scale,
      offsetX,
      offsetY,
    });
    renderer.stage.addChild(cursorAnalysis.graphics);
  }

  const setCursorAnalysis = (enabled: boolean) => {
    cursorAnalysis?.setVisible(enabled);
  };

  const modContainer = new Container();
  modContainer.zIndex = 1000;
  renderer.stage.addChild(modContainer);

  let hiddenActive = false;

  let modRequestId = 0;
  const setMods = async (mods: ModInfo[]) => {
    hiddenActive = mods.some((mod) => mod.acronym === "HD");

    const requestId = ++modRequestId;
    modContainer.removeChildren().forEach((child) => child.destroy());

    if (mods.length === 0) return;

    const margin = 16 * scale;
    const targetSize = 32 * scale;
    const gap = -targetSize * 0.25;

    const modTextures = await Promise.all(
      mods.map((mod) => Assets.load(mod.iconUrl).catch(() => null)),
    );
    if (requestId !== modRequestId) return;

    let y = margin;
    for (const texture of modTextures) {
      if (!texture) continue;
      const aspect = texture.width / texture.height;
      const sprite = new Sprite({
        texture,
        anchor: { x: 1, y: 0 },
        x: width - margin,
        y,
      });
      sprite.height = targetSize;
      sprite.width = targetSize * aspect;
      modContainer.addChild(sprite);
      y += targetSize + gap;
    }
  };

  const resultTexture = (result: HitResult): Texture | null =>
    (
      ({
        [HitResult.Good]: textures.hit100,
        [HitResult.Ok]: textures.hit100,
        [HitResult.Meh]: textures.hit50,
        [HitResult.Great]: textures.hit300,
        [HitResult.Perfect]: textures.hit300,
        [HitResult.Miss]: textures.hit0,
      }) as Record<HitResult, Texture | null>
    )[result] ?? null;

  // Helper to create and register a hit result sprite
  const createHitResultSprite = (hitObject: HitObject, x: number, y: number): void => {
    const sprite = new Sprite({
      texture: resultTexture(hitObject.result) ?? Texture.EMPTY,
      x,
      y,
      zIndex: -hitObject.time,
      alpha: 0,
      visible: false,
      anchor: 0.5,
      scale: scale * 0.5,
    });
    renderer.stage.addChild(sprite);
    hitResults.push({ hitObject, sprite, textureVersion });
  };

  // Convert beatmap combo colors to hex numbers
  let comboColors = beatmap.colors.comboColors.map((c) => (c.red << 16) + (c.green << 8) + c.blue);

  let hitColorIndex = 0;
  let hitCircleNumber = 1;
  for (const hitObject of simulation.hitObjects) {
    if (hitObject.type & HIT_TYPE_SPINNER) {
      const spinner = new Spinner({
        x: width / 2,
        y: height / 2,
        startTime: hitObject.time,
        endTime: hitObject.endTime!,
        radius: 100 * scale,
        scale,
        overallDifficulty: beatmap.difficulty.overallDifficulty,
        skin,
      });

      spinner.zIndex = -hitObject.time;
      spinner.alpha = 0;
      spinner.visible = false;
      renderer.stage.addChild(spinner);

      spinners.push({ hitObject, spinner, textureVersion });
      createHitResultSprite(hitObject, width / 2, height / 2);
      continue;
    }

    // Handle new combo (raw index, no modulo)
    if (hitObject.type & HIT_TYPE_NEW_COMBO) {
      hitColorIndex += 1;
      hitCircleNumber = 1;
    }

    const hitObjectX = hitObject.x * scale + offsetX;
    const hitObjectY = hitObject.y * scale + offsetY;

    if (hitObject.type & HIT_TYPE_SLIDER && hitObject.slider) {
      const slider = new SliderObject({
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
        renderer: renderer.renderer,
        skin,
      });

      hitCircleNumber += 1;
      slider.zIndex = -hitObject.time;
      slider.alpha = 0;
      slider.visible = false;
      renderer.stage.addChild(slider);

      sliders.push({ hitObject, slider, textureVersion, colorVersion });
      createHitResultSprite(hitObject, hitObjectX, hitObjectY);
      continue;
    }

    // Regular hit circle
    const hitCircle = new HitCircle({
      x: hitObjectX,
      y: hitObjectY,
      time: hitObject.time,
      resultTime: hitObject.resultTime,
      number: hitCircleNumber,
      comboColorIndex: hitColorIndex,
      comboColors,
      radius: objectRadius,
      preempt,
      skin,
    });

    hitCircleNumber += 1;
    hitCircle.zIndex = -hitObject.time;
    hitCircle.alpha = 0;
    hitCircle.visible = false;
    renderer.stage.addChild(hitCircle);

    circles.push({ hitObject, hitCircle, textureVersion, colorVersion });
    createHitResultSprite(hitObject, hitObjectX, hitObjectY);
  }

  // Subscribe to texture changes — only update the always-visible cursor
  // immediately; everything else is deferred to the update loop.
  const unsubscribeTextures = skin.onChanged(() => {
    cursor.texture = textures.cursor ?? Texture.EMPTY;
    textureVersion++;
  });

  const update = (time: number) => {
    // Get current frame for spinner rotation and slider tracking
    const nextFrameIndex = findNextFrameIndex(simulation.frames, time);
    const currentFrame =
      simulation.frames[nextFrameIndex - 1] || simulation.frames[simulation.frames.length - 1];

    // Update spinners
    for (const entry of spinners) {
      if (time >= entry.hitObject.time && time <= entry.hitObject.endTime!) {
        if (entry.textureVersion !== textureVersion) {
          entry.spinner.updateTextures();
          entry.textureVersion = textureVersion;
        }
        entry.spinner.visible = true;
        const rotation = currentFrame.currentSpinnerRotation || 0;
        entry.spinner.update(time, rotation);
        entry.spinner.alpha = 1;
      } else {
        entry.spinner.visible = false;
      }
    }

    // Update sliders
    for (const entry of sliders) {
      const sliderEndTime = entry.hitObject.endTime!;

      // Slider is visible from preempt time before start until end
      if (time >= entry.hitObject.time - preempt && time <= sliderEndTime) {
        if (entry.textureVersion !== textureVersion) {
          entry.slider.updateTextures();
          entry.textureVersion = textureVersion;
        }
        if (entry.colorVersion !== colorVersion) {
          entry.slider.updateColor(comboColors);
          entry.colorVersion = colorVersion;
        }
        // Container holds the fade-in only — slider components handle the
        // Hidden fade-out themselves to avoid doubling the alpha multiplier.
        const alpha = calcFadeInAlpha(
          time,
          beatmap.difficulty.approachRate,
          entry.hitObject,
          hiddenActive,
        );
        entry.slider.visible = true;
        entry.slider.alpha = alpha;

        // Determine if currently tracking (simplified - check if any action is pressed)
        const isTracking =
          currentFrame.activeSliderProgress !== undefined &&
          time >= entry.hitObject.time &&
          time <= sliderEndTime;

        entry.slider.update(time, isTracking, hiddenActive);
      } else {
        entry.slider.visible = false;
      }
    }

    // Update hit circles
    for (const entry of circles) {
      if (time >= entry.hitObject.time - preempt && time <= entry.hitObject.resultTime) {
        if (entry.textureVersion !== textureVersion) {
          entry.hitCircle.updateTextures();
          entry.textureVersion = textureVersion;
        }
        if (entry.colorVersion !== colorVersion) {
          entry.hitCircle.updateColor(comboColors);
          entry.colorVersion = colorVersion;
        }
        const alpha = calcAlpha(
          time,
          beatmap.difficulty.approachRate,
          entry.hitObject,
          hiddenActive,
        );
        entry.hitCircle.visible = true;
        entry.hitCircle.update(time, hiddenActive);
        entry.hitCircle.alpha = alpha;
      } else {
        entry.hitCircle.visible = false;
      }
    }

    // Update hit result sprites (consolidated logic for all object types)
    for (const entry of hitResults) {
      const resultTime = entry.hitObject.endTime ?? entry.hitObject.resultTime;
      if (time >= resultTime && time <= resultTime + 200) {
        if (entry.textureVersion !== textureVersion) {
          entry.sprite.texture = resultTexture(entry.hitObject.result) ?? Texture.EMPTY;
          entry.textureVersion = textureVersion;
        }
        entry.sprite.visible = true;
        entry.sprite.alpha = 1;
      } else {
        entry.sprite.visible = false;
        entry.sprite.alpha = 0;
      }
    }

    if (simulation) {
      const cursorFrameIndex = findNextFrameIndex(simulation.frames, time);
      const cursorFrame =
        simulation.frames[cursorFrameIndex - 1] || simulation.frames[simulation.frames.length - 1];
      const nextFrame =
        simulation.frames[cursorFrameIndex] || simulation.frames[simulation.frames.length - 1];
      const { x, y } = lerp2D(
        cursorFrame.time,
        cursorFrame.x,
        cursorFrame.y,
        nextFrame.time,
        nextFrame.x,
        nextFrame.y,
        time,
      );

      cursor.x = x * scale + offsetX;
      cursor.y = y * scale + offsetY;
      debugText.text = getDebugText(cursorFrame);

      cursorAnalysis?.update(time);
    }
  };

  return {
    app: renderer,
    canvas: renderer.canvas,
    update,
    destroy: () => {
      unsubscribeTextures();
      renderer.destroy(true, { children: true, texture: true });
    },
    setComboColors,
    setCursorAnalysis,
    setMods,
  };
};
