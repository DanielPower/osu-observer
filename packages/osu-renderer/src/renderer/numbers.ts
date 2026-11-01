import { skinImageSize, type SkinImages, type SkinKey } from "../skin";
import { drawTintedSprite } from "./draw";

/** Stable applies a blanket 0.8x scale to hit circle numbers (lazer's hitcircle_text_scale). */
const HIT_CIRCLE_TEXT_SCALE = 0.8;

/**
 * Draws a hit circle's combo number from the skin's default-0..9 images, as lazer's
 * LegacySpriteText does: each digit at its own width, spaced by -HitCircleOverlap.
 * `unit` is canvas pixels per skin pixel at this object's scale.
 */
export function drawComboNumber(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  number: number,
  x: number,
  y: number,
  unit: number,
  overlap: number,
  alpha: number,
  scale: number,
  tint: number,
): void {
  if (alpha <= 0) return;
  const digits = String(number)
    .split("")
    .map((digit) => images[`default-${digit}` as SkinKey]);
  if (digits.some((image) => !image)) {
    drawFallbackNumber(ctx, number, x, y, unit, alpha, scale);
    return;
  }

  const size = unit * HIT_CIRCLE_TEXT_SCALE * scale;
  const spacing = -overlap * size;
  const widths = digits.map((image) => skinImageSize(image!).width * size);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (digits.length - 1);
  let left = x - total / 2;
  for (let i = 0; i < digits.length; i++) {
    const image = digits[i]!;
    const height = skinImageSize(image).height * size;
    drawTintedSprite(ctx, image, left + widths[i] / 2, y, widths[i], height, tint, alpha);
    left += widths[i] + spacing;
  }
}

function drawFallbackNumber(
  ctx: CanvasRenderingContext2D,
  number: number,
  x: number,
  y: number,
  unit: number,
  alpha: number,
  scale: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${40 * unit * scale}px Arial`;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), x, y);
  ctx.restore();
}
