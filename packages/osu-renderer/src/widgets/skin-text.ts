import type { SimulatedFrame } from "osu-simulation";
import type { Widget, WidgetContext } from "./widget";

/**
 * Creates a Widget that renders a string using skin image sprites.
 *
 * @param context   - Widget context from the renderer.
 * @param rightAlign - If true, the right edge of the text sits at canvasX.
 * @param anchorY    - 0 = top-aligned at canvasY, 1 = bottom-aligned at canvasY.
 * @param charImage  - Maps a single character to its skin ImageBitmap.
 * @param computeText - Returns the string to display for the current frame.
 */
export function createSkinTextWidget(
  { scale, canvasX, canvasY }: WidgetContext,
  rightAlign: boolean,
  anchorY: number,
  charImage: (char: string) => ImageBitmap | undefined,
  computeText: (frame: SimulatedFrame, time: number) => string,
): Widget {
  const imgScale = scale / 2;

  return {
    draw(ctx: CanvasRenderingContext2D, frame: SimulatedFrame, time: number): void {
      const text = computeText(frame, time);

      let totalWidth = 0;
      const chars: Array<{ img: ImageBitmap; w: number; h: number }> = [];
      for (const char of text) {
        const img = charImage(char);
        if (!img) continue;
        const w = img.width * imgScale;
        const h = img.height * imgScale;
        chars.push({ img, w, h });
        totalWidth += w;
      }

      if (chars.length > 0) {
        let x = rightAlign ? canvasX - totalWidth : canvasX;
        for (const { img, w, h } of chars) {
          const y = anchorY === 1 ? canvasY - h : canvasY;
          ctx.drawImage(img, x, y, w, h);
          x += w;
        }
      } else {
        ctx.save();
        ctx.font = `bold ${24 * scale}px Arial`;
        ctx.fillStyle = "white";
        ctx.textAlign = rightAlign ? "right" : "left";
        ctx.textBaseline = anchorY === 1 ? "bottom" : "top";
        ctx.fillText(text, canvasX, canvasY);
        ctx.restore();
      }
    },
  };
}
