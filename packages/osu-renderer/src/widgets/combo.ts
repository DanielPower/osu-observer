import { Texture } from "pixi.js";
import type { SimulatedFrame } from "osu-simulation";
import type { SkinTextures } from "../skin";
import type { Widget, WidgetContext, WidgetFactory } from "./widget";
import { SkinTextWidget } from "./skin-text";

class ComboWidget extends SkinTextWidget {
  constructor(context: WidgetContext) {
    // anchorY=1: sprites sit with their bottom at y=0, matching origin: 'bottom-left'
    super(context, 6, false, 1); // 5 combo digits + 'x' covers combos up to 99999
    this.setText("0x");
  }

  protected charTexture(char: string): Texture {
    if (char === "x") return this.skin.textures["score-x"] ?? Texture.EMPTY;
    return this.skin.textures[`score-${char}` as keyof SkinTextures] ?? Texture.EMPTY;
  }

  update(frame: SimulatedFrame, _time: number): void {
    this.setText(`${frame.combo}x`);
  }
}

/**
 * Displays the current combo as e.g. "1234x", using the skin's
 * `score-0.png` – `score-9.png` digits and `score-x.png` suffix.
 * Reacts to skin changes.
 *
 * Intended placement: `{ x: 5, y: 5, anchor: 'bottom-left', origin: 'bottom-left' }`
 */
export const comboWidget: WidgetFactory = (context) => new ComboWidget(context) as Widget;
