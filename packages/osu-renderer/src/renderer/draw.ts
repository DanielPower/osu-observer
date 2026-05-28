// Shared canvas drawing utilities.
//
// All functions use `ImageBitmap` rather than `HTMLImageElement` so that
// `ctx.drawImage` never has to lazily re-read source data — this prevents
// Chrome's NotReadableError that occurs when an HTMLImageElement's blob URL
// is decoded at draw time rather than at load time.

const tintCache = new WeakMap<ImageBitmap, Map<number, OffscreenCanvas>>();

/**
 * Returns a tinted copy of `img` for the given 0xRRGGBB color, using a
 * WeakMap cache keyed by (img, color). Tinting uses multiply compositing
 * followed by destination-in to restore the original alpha channel.
 */
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

/**
 * Draws `img` centered at (cx, cy) with dimensions (w, h).
 * Skips the draw entirely when alpha <= 0.
 */
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

/**
 * Tints `img` with `color` (0xRRGGBB) then draws it centered at (cx, cy).
 */
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

/**
 * Converts a 0xRRGGBB integer to an `"rgb(r,g,b)"` CSS color string.
 */
export function hexColor(color: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgb(${r},${g},${b})`;
}
