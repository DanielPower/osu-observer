import { Container, Sprite, Texture } from "pixi.js";
import type { SimulatedFrame } from "osu-simulation";
import type { Skin, SkinTextures } from "../skin";
import type { Widget, WidgetContext, WidgetFactory } from "./widget";

// 5 combo digits + 'x' = 6 characters covers combos up to 99999
const MAX_CHARS = 6;

class ComboWidget extends Container {
  private readonly sprites: Sprite[];
  private readonly skin: Skin;
  private currentCombo = "0x";
  private readonly unsubscribe: () => void;

  constructor({ scale, skin }: WidgetContext) {
    super();
    this.skin = skin;

    this.sprites = Array.from({ length: MAX_CHARS }, () => {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.scale.set(scale);
      // Bottom-left anchor: the sprite's bottom edge sits at the container's y=0,
      // matching the origin: 'bottom-left' convention.
      sprite.anchor.set(0, 1);
      this.addChild(sprite);
      return sprite;
    });

    this.unsubscribe = skin.onChanged(() => this.refresh());
    this.refresh();
  }

  private charTexture(char: string): Texture {
    if (char === "x") return this.skin.textures["score-x"] ?? Texture.EMPTY;
    return this.skin.textures[`score-${char}` as keyof SkinTextures] ?? Texture.EMPTY;
  }

  private refresh(): void {
    const chars = this.currentCombo;
    let x = 0;
    for (let i = 0; i < chars.length; i++) {
      this.sprites[i].texture = this.charTexture(chars[i]);
      this.sprites[i].visible = true;
      this.sprites[i].x = x;
      x += this.sprites[i].width;
    }
    for (let i = chars.length; i < MAX_CHARS; i++) {
      this.sprites[i].visible = false;
    }
  }

  update(frame: SimulatedFrame, _time: number): void {
    const combo = `${frame.combo}x`;
    if (combo === this.currentCombo) return;
    this.currentCombo = combo;
    this.refresh();
  }

  override destroy(...args: Parameters<Container["destroy"]>): void {
    this.unsubscribe();
    super.destroy(...args);
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
