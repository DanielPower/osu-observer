import { Container, Sprite, Texture } from "pixi.js";
import type { Skin } from "../skin";
import type { WidgetContext } from "./widget";

/**
 * Base class for widgets that display a string of characters using skin
 * sprite textures.
 *
 * Subclasses implement `charTexture` to map each character to a skin texture,
 * and call `setText` in their `update` method (and once in their constructor
 * to set the initial value). All sprite pool management, skin-change
 * subscriptions, and layout are handled here.
 */
export abstract class SkinTextWidget extends Container {
  protected readonly skin: Skin;
  private readonly sprites: Sprite[];
  private readonly rightAlign: boolean;
  private currentText = "";
  private readonly unsubscribe: () => void;

  /**
   * @param context - Widget context from the renderer.
   * @param maxChars - Sprite pool size (longest possible string this widget will display).
   * @param rightAlign - If true, the right edge of the rendered text sits at x=0
   *   (for `origin: 'top-right'`). If false, the left edge sits at x=0
   *   (for `origin: 'top-left'` / `'bottom-left'`).
   * @param anchorY - Vertical anchor for each sprite (0 = top, 1 = bottom).
   *   Use 1 with `origin: 'bottom-left'` so sprites grow upward from y=0.
   */
  protected constructor(
    { scale, skin }: Pick<WidgetContext, "scale" | "skin">,
    maxChars: number,
    rightAlign: boolean,
    anchorY = 0,
  ) {
    super();
    this.skin = skin;
    this.rightAlign = rightAlign;

    this.sprites = Array.from({ length: maxChars }, () => {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.scale.set(scale / 2);
      sprite.anchor.set(0, anchorY);
      this.addChild(sprite);
      return sprite;
    });

    this.unsubscribe = skin.onChanged(() => this.layout(this.currentText));
  }

  /** Maps a single character to its skin texture. */
  protected abstract charTexture(char: string): Texture;

  /**
   * Updates the displayed text. A no-op if the text hasn't changed,
   * so it is safe to call every frame.
   */
  protected setText(text: string): void {
    if (text === this.currentText) return;
    this.currentText = text;
    this.layout(text);
  }

  private layout(text: string): void {
    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
      this.sprites[i].texture = this.charTexture(text[i]);
      this.sprites[i].visible = true;
      this.sprites[i].x = totalWidth;
      totalWidth += this.sprites[i].width;
    }
    for (let i = text.length; i < this.sprites.length; i++) {
      this.sprites[i].visible = false;
    }
    if (this.rightAlign) {
      for (let i = 0; i < text.length; i++) {
        this.sprites[i].x -= totalWidth;
      }
    }
  }

  override destroy(...args: Parameters<Container["destroy"]>): void {
    this.unsubscribe();
    super.destroy(...args);
  }
}
