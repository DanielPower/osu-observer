import { Texture } from "pixi.js";
import type { SimulatedFrame } from "osu-simulation";
import type { SkinTextures } from "../skin";
import type { Widget, WidgetContext, WidgetFactory } from "./widget";
import { SkinTextWidget } from "./skin-text";

class ScoreWidget extends SkinTextWidget {
  constructor(context: WidgetContext) {
    super(context, 9, true); // 9 sprites covers scores up to 999,999,999
    this.setText("0");
  }

  protected charTexture(char: string): Texture {
    return this.skin.textures[`score-${char}` as keyof SkinTextures] ?? Texture.EMPTY;
  }

  update(frame: SimulatedFrame, _time: number): void {
    this.setText(frame.score.toString());
  }
}

/**
 * Displays the current score using the skin's `score-0.png` – `score-9.png`
 * sprites. Reacts to skin changes.
 *
 * Intended placement: `{ x: 5, y: 5, anchor: 'top-right', origin: 'top-right' }`
 */
export const scoreWidget: WidgetFactory = (context) => new ScoreWidget(context) as Widget;
