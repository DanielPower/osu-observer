import { Container, Sprite, Texture } from "pixi.js";
import type { SimulatedFrame } from "osu-simulation";
import type { Skin, SkinTextures } from "../skin";
import type { Widget, WidgetContext, WidgetFactory } from "./widget";

// "100.00%" is the longest possible accuracy string (7 characters).
const MAX_CHARS = 7;

class AccuracyWidget extends Container {
  private readonly sprites: Sprite[];
  private readonly skin: Skin;
  private currentAccuracy = "100.00%";
  private readonly unsubscribe: () => void;

  constructor({ scale, skin }: WidgetContext) {
    super();
    this.skin = skin;

    this.sprites = Array.from({ length: MAX_CHARS }, () => {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.scale.set(scale);
      this.addChild(sprite);
      return sprite;
    });

    this.unsubscribe = skin.onChanged(() => this.refresh());
    this.refresh();
  }

  private charTexture(char: string): Texture {
    if (char === ".") return this.skin.textures["score-dot"] ?? Texture.EMPTY;
    if (char === "%") return this.skin.textures["score-percent"] ?? Texture.EMPTY;
    return this.skin.textures[`score-${char}` as keyof SkinTextures] ?? Texture.EMPTY;
  }

  private refresh(): void {
    const chars = this.currentAccuracy;
    let totalWidth = 0;
    for (let i = 0; i < chars.length; i++) {
      this.sprites[i].texture = this.charTexture(chars[i]);
      this.sprites[i].visible = true;
      this.sprites[i].x = totalWidth;
      totalWidth += this.sprites[i].width;
    }
    for (let i = chars.length; i < MAX_CHARS; i++) {
      this.sprites[i].visible = false;
    }
    // Shift left so the right edge sits at x=0 (origin: 'top-right' convention)
    for (let i = 0; i < chars.length; i++) {
      this.sprites[i].x -= totalWidth;
    }
  }

  update(frame: SimulatedFrame, _time: number): void {
    const accuracy = `${(frame.accuracy * 100).toFixed(2)}%`;
    if (accuracy === this.currentAccuracy) return;
    this.currentAccuracy = accuracy;
    this.refresh();
  }

  override destroy(...args: Parameters<Container["destroy"]>): void {
    this.unsubscribe();
    super.destroy(...args);
  }
}

/**
 * Displays the current accuracy as "XX.XX%" using the skin's
 * `default-0.png` – `default-9.png`, `default-dot.png`, and
 * `default-percent.png` sprites. Reacts to skin changes.
 *
 * Intended placement: `{ x: 5, y: 20, anchor: 'top-right', origin: 'top-right' }`
 */
export const accuracyWidget: WidgetFactory = (context) => new AccuracyWidget(context) as Widget;
