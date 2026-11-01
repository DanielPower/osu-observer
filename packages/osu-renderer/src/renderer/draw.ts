import { skinImageSize } from "../skin";

const tintCache = new WeakMap<ImageBitmap, Map<number, OffscreenCanvas>>();
export function getTinted(img: ImageBitmap, color: number): OffscreenCanvas {
  let colorMap = tintCache.get(img);
  if (!colorMap) {
    colorMap = new Map();
    tintCache.set(img, colorMap);
  }

  const cached = colorMap.get(color);
  if (cached) return cached;

  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d")!;

  // Draw the original image
  ctx.drawImage(img, 0, 0);

  // Multiply-blend the tint color over the image
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = hexColor(color);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Restore the original alpha mask
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);

  colorMap.set(color, canvas);
  return canvas;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | OffscreenCanvas,
  cx: number,
  cy: number,
  w: number,
  h: number,
  alpha: number = 1,
): void {
  if (alpha <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.globalAlpha = prev;
}

export function drawTintedSprite(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap,
  cx: number,
  cy: number,
  w: number,
  h: number,
  color: number,
  alpha: number = 1,
): void {
  const tinted = getTinted(img, color);
  drawSprite(ctx, tinted, cx, cy, w, h, alpha);
}

export function hexColor(color: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgb(${r},${g},${b})`;
}

/** A colour with each channel multiplied by `factor`. */
export function scaleColor(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/**
 * The canvas size of a skin sprite: its size in skin pixels (an @2x image counts
 * half) times `unit`, shrunk to fit `maxSkinSize` skin pixels when given, as
 * lazer's Texture.WithMaximumSize does.
 */
export function spriteSize(
  img: ImageBitmap,
  unit: number,
  maxSkinSize?: number,
): { width: number; height: number } {
  const size = skinImageSize(img);
  const fit = maxSkinSize ? Math.min(1, maxSkinSize / size.width, maxSkinSize / size.height) : 1;
  return { width: size.width * fit * unit, height: size.height * fit * unit };
}
