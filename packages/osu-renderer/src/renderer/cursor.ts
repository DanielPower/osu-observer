import { SkinImages } from "../skin";
import { drawSprite } from "./draw";

export const drawCursor = (
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  cursorX: number,
  cursorY: number,
  cursorScale: number,
): void => {
  if (images.cursor) {
    const cw = images.cursor.width * cursorScale;
    const ch = images.cursor.height * cursorScale;
    drawSprite(ctx, images.cursor, cursorX, cursorY, cw, ch);
  }

  if (images.cursormiddle) {
    const cw = images.cursormiddle.width * cursorScale;
    const ch = images.cursormiddle.height * cursorScale;
    drawSprite(ctx, images.cursormiddle, cursorX, cursorY, cw, ch);
  }
};
