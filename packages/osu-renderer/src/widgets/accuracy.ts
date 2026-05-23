import { Texture } from "pixi.js";
import type { SimulatedFrame } from "osu-simulation";
import type { SkinTextures } from "../skin";
import type { Widget, WidgetContext, WidgetFactory } from "./widget";
import { SkinTextWidget } from "./skin-text";

class AccuracyWidget extends SkinTextWidget {
  constructor(context: WidgetContext) {
    super(context, 7, true); // "100.00%" is the longest possible string (7 chars)
    this.setText("100.00%");
  }

  protected charTexture(char: string): Texture {
    if (char === ".") return this.skin.textures["score-dot"] ?? Texture.EMPTY;
    if (char === "%") return this.skin.textures["score-percent"] ?? Texture.EMPTY;
    return this.skin.textures[`score-${char}` as keyof SkinTextures] ?? Texture.EMPTY;
  }

  update(frame: SimulatedFrame, _time: number): void {
    this.setText(`${(frame.accuracy * 100).toFixed(2)}%`);
  }
}

/**
 * Displays the current accuracy as "XX.XX%" using the skin's
 * `score-0.png` – `score-9.png`, `score-dot.png`, and `score-percent.png`
 * sprites. Reacts to skin changes.
 *
 * Intended placement: `{ x: 5, y: 20, anchor: 'top-right', origin: 'top-right' }`
 */
export const accuracyWidget: WidgetFactory = (context) => new AccuracyWidget(context) as Widget;
