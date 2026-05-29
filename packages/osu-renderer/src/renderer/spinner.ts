import type { SkinImages } from "../skin";
import { getSpinsRequired } from "../math";
import { drawSprite } from "./draw";

export function drawSpinner(
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  params: {
    x: number;
    y: number;
    startTime: number;
    endTime: number;
    radius: number;
    scale: number;
    overallDifficulty: number;
  },
  time: number,
  rotation: number,
): void {
  const { x, y, startTime, endTime, radius, scale, overallDifficulty } = params;
  const spinsRequired = getSpinsRequired(endTime - startTime, overallDifficulty);

  if (images["spinner-bottom"]) {
    drawSprite(ctx, images["spinner-bottom"], x, y, radius * 2, radius * 2);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  if (images["spinner-middle"]) {
    ctx.drawImage(images["spinner-middle"], -radius, -radius, radius * 2, radius * 2);
  }
  ctx.restore();

  const ambientRotation = ((time - startTime) / 1000) * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-ambientRotation * 0.5);
  if (images["spinner-top"]) {
    ctx.drawImage(images["spinner-top"], -radius, -radius, radius * 2, radius * 2);
  }
  ctx.restore();

  const approachProgress = (time - startTime) / (endTime - startTime);
  const approachScale = 1 + (1 - approachProgress) * 2;
  if (images["spinner-approachcircle"]) {
    drawSprite(
      ctx,
      images["spinner-approachcircle"],
      x,
      y,
      radius * 2 * approachScale,
      radius * 2 * approachScale,
      0.7,
    );
  }

  // Progress arc and SPM readout — always rendered, not skin elements.
  const completedSpins = rotation / (2 * Math.PI);
  const completionProgress = Math.min(1, completedSpins / spinsRequired);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius + 15, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(51,51,51,0.5)";
  ctx.lineWidth = 6;
  ctx.stroke();

  if (completionProgress > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + completionProgress * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(x, y, radius + 15, startAngle, endAngle);
    ctx.strokeStyle =
      completionProgress >= 1.0
        ? "rgba(102,255,102,0.9)"
        : completionProgress >= 0.75
          ? "rgba(255,255,102,0.9)"
          : "rgba(255,102,102,0.9)";
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.restore();

  const elapsed = time - startTime;
  const spm = elapsed > 0 ? Math.abs(rotation / (2 * Math.PI) / (elapsed / 60000)) : 0;
  ctx.save();
  ctx.fillStyle = "white";
  ctx.font = `bold ${20 * scale}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(spm)} SPM`, x, y + radius + 40 * scale);
  ctx.restore();
}
