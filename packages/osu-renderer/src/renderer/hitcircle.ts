import type { SkinImages } from "../skin";
import { drawSprite, drawTintedSprite } from "./draw";

export function drawHitCircle(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  params: {
    x: number;
    y: number;
    hitTime: number;
    currentTime: number;
    radius: number;
    preempt: number;
    number: number;
    color: number;
    alpha: number;
    hidden: boolean;
  },
): void {
  const { x, y, hitTime, currentTime, radius, preempt, number, color, alpha, hidden } = params;

  if (!hidden && currentTime < hitTime && images.approachcircle) {
    const progress = Math.min(Math.max(1 - (hitTime - currentTime) / preempt, 0), 1);
    const approachRadius = (3 - 2 * progress) * radius;
    drawTintedSprite(
      ctx,
      images.approachcircle,
      x,
      y,
      approachRadius * 2,
      approachRadius * 2,
      color,
      alpha,
    );
  }

  if (images.hitcircle) {
    drawTintedSprite(ctx, images.hitcircle, x, y, radius * 2, radius * 2, color, alpha);
  }

  if (images.hitcircleoverlay) {
    drawSprite(ctx, images.hitcircleoverlay, x, y, radius * 2, radius * 2, alpha);
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${radius * 0.7}px Arial`;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), x, y);
  ctx.restore();
}
