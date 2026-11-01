import { SCOREBAR_COLOUR_FRAMES, skinImageSize, type SkinImages } from "../skin";
import type { WidgetFactory } from "./widget";

// Positions follow lazer's LegacyHealthDisplay, in the 1024x768 skinning space
// (stable's coordinates times LegacySkin.STABLE_MAGIC_SCALE_FACTOR).
const STABLE_MAGIC_SCALE_FACTOR = 1.6;
const OLD_STYLE_FILL = { x: 3 * STABLE_MAGIC_SCALE_FACTOR, y: 10 * STABLE_MAGIC_SCALE_FACTOR };
const NEW_STYLE_FILL = { x: 7.5 * STABLE_MAGIC_SCALE_FACTOR, y: 7.8 * STABLE_MAGIC_SCALE_FACTOR };
const EPIC_CUTOFF = 0.5;
const FILL_EASING_MS = 200;

type Colour = [number, number, number];
const WHITE: Colour = [255, 255, 255];
const BLACK: Colour = [0, 0, 0];
const RED: Colour = [255, 0, 0];

const mix = (from: Colour, to: Colour, t: number): Colour => {
  const clamped = Math.min(1, Math.max(0, t));
  return from.map((c, i) => c + (to[i] - c) * clamped) as Colour;
};

// LegacyHealthDisplay.getFillColour.
function fillColour(health: number): Colour {
  if (health < 0.2) return mix(BLACK, RED, (0.2 - health) / 0.2);
  if (health < EPIC_CUTOFF) return mix(WHITE, BLACK, (0.5 - health) / 0.5);
  return WHITE;
}

const isWhite = ([r, g, b]: Colour) => r === 255 && g === 255 && b === 255;
const css = ([r, g, b]: Colour) => `rgb(${r}, ${g}, ${b})`;

/** The scorebar-colour frames, which lazer animates at one loop per second. */
function fillFrames(images: SkinImages): ImageBitmap[] {
  const frames: ImageBitmap[] = [];
  for (let i = 0; i < SCOREBAR_COLOUR_FRAMES; i++) {
    const frame = images[`scorebar-colour-${i}`];
    if (!frame) break;
    frames.push(frame);
  }
  if (frames.length > 0) return frames;
  return images["scorebar-colour"] ? [images["scorebar-colour"]] : [];
}

/**
 * The health bar, drawn from the skin's scorebar-bg, scorebar-colour (or its
 * animation frames) and either scorebar-marker (new style) or scorebar-ki,
 * -kidanger and -kidanger2 (old style), as lazer's legacy skins draw it. A skin
 * without scorebar-colour gets a plain bar instead.
 */
export const scorebarWidget: WidgetFactory = ({ images, scale, canvasX, canvasY }) => {
  let tint: OffscreenCanvas | null = null;
  const tinted = (image: ImageBitmap, colour: Colour, width = image.width) => {
    tint ??= new OffscreenCanvas(image.width, image.height);
    tint.width = Math.max(1, width);
    tint.height = image.height;
    const tintCtx = tint.getContext("2d")!;
    tintCtx.drawImage(image, 0, 0);
    tintCtx.globalCompositeOperation = "multiply";
    tintCtx.fillStyle = css(colour);
    tintCtx.fillRect(0, 0, tint.width, tint.height);
    tintCtx.globalCompositeOperation = "destination-in";
    tintCtx.drawImage(image, 0, 0);
    return tint;
  };

  // The fill eases towards the current health as lazer's does (OutQuint over 200ms).
  let shownHealth = 1;
  let lastTime: number | null = null;
  const easedHealth = (health: number, time: number) => {
    const elapsed = lastTime === null ? Infinity : time - lastTime;
    lastTime = time;
    // Seeking (backwards, or far ahead) shows the health straight away.
    if (elapsed < 0 || elapsed > 1000) {
      shownHealth = health;
    } else {
      const t = Math.min(1, elapsed / FILL_EASING_MS);
      shownHealth += (health - shownHealth) * (1 - (1 - t) ** 5);
    }
    return shownHealth;
  };

  return {
    draw(ctx, frame, time) {
      const health = easedHealth(frame.health, time);
      // Read on every draw: the renderer swaps a skin's images into `images` after
      // the widgets are created.
      const frames = fillFrames(images);
      const background = images["scorebar-bg"];
      const marker = images["scorebar-marker"];
      const fillPosition = marker ? NEW_STYLE_FILL : OLD_STYLE_FILL;

      if (frames.length === 0) {
        drawPlainBar(ctx, canvasX, canvasY, scale, health);
        return;
      }

      if (background) {
        const size = skinImageSize(background);
        ctx.drawImage(background, canvasX, canvasY, size.width * scale, size.height * scale);
      }

      const fill = frames[Math.floor(time / (1000 / frames.length)) % frames.length] ?? frames[0];
      const fillSize = skinImageSize(fill);
      // The fill is cropped to the health: in the image's own pixels, and in 1x skin pixels.
      const fillPixels = Math.round(fill.width * health);
      const fillWidth = fillSize.width * health;
      const fillX = canvasX + fillPosition.x * scale;
      const fillY = canvasY + fillPosition.y * scale;
      const colour = marker ? fillColour(frame.health) : WHITE;
      if (fillPixels > 0) {
        const source = isWhite(colour) ? fill : tinted(fill, colour, fillPixels);
        ctx.drawImage(
          source,
          0,
          0,
          fillPixels,
          fill.height,
          fillX,
          fillY,
          fillWidth * scale,
          fillSize.height * scale,
        );
      }

      const markerX = fillX + fillWidth * scale;
      if (marker) {
        const markerY = fillY + (fillSize.height * scale) / 2;
        ctx.save();
        // Above the cutoff the marker glows (additive blending), as in lazer.
        if (frame.health >= EPIC_CUTOFF) ctx.globalCompositeOperation = "lighter";
        const source = isWhite(colour) ? marker : tinted(marker, colour);
        drawCentred(ctx, source, skinImageSize(marker), markerX, markerY, scale);
        ctx.restore();
        return;
      }

      const ki =
        frame.health < 0.2
          ? images["scorebar-kidanger2"]
          : frame.health < EPIC_CUTOFF
            ? images["scorebar-kidanger"]
            : images["scorebar-ki"];
      if (ki) drawCentred(ctx, ki, skinImageSize(ki), markerX, fillY, scale);
    },
  };
};

function drawCentred(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  { width, height }: { width: number; height: number },
  x: number,
  y: number,
  scale: number,
) {
  ctx.drawImage(
    image,
    x - (width * scale) / 2,
    y - (height * scale) / 2,
    width * scale,
    height * scale,
  );
}

const PLAIN_BAR = { x: 12, y: 12, width: 560, height: 10, padding: 3 };

function drawPlainBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  health: number,
) {
  const { width, height, padding } = PLAIN_BAR;
  const left = x + PLAIN_BAR.x * scale;
  const top = y + PLAIN_BAR.y * scale;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.beginPath();
  ctx.roundRect(
    left - padding * scale,
    top - padding * scale,
    (width + padding * 2) * scale,
    (height + padding * 2) * scale,
    ((height + padding * 2) / 2) * scale,
  );
  ctx.fill();
  if (health > 0) {
    ctx.fillStyle = health < 0.2 ? css(mix(WHITE, RED, (0.2 - health) / 0.2)) : "white";
    ctx.beginPath();
    ctx.roundRect(
      left,
      top,
      Math.max(height, width * health) * scale,
      height * scale,
      (height / 2) * scale,
    );
    ctx.fill();
  }
  ctx.restore();
}
