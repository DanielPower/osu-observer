import { skinImageSize, type SkinImages } from "../skin";
import { drawSprite } from "./draw";

export const drawCursor = (
  ctx: CanvasRenderingContext2D,
  images: SkinImages,
  cursorX: number,
  cursorY: number,
  cursorScale: number,
): void => {
  if (images.cursor) {
    const { width, height } = skinImageSize(images.cursor);
    const cw = width * cursorScale;
    const ch = height * cursorScale;
    drawSprite(ctx, images.cursor, cursorX, cursorY, cw, ch);
  }

  if (images.cursormiddle) {
    const { width, height } = skinImageSize(images.cursormiddle);
    const cw = width * cursorScale;
    const ch = height * cursorScale;
    drawSprite(ctx, images.cursormiddle, cursorX, cursorY, cw, ch);
  }
};
