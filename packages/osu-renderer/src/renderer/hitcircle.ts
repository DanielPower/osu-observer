import type { Skin } from "../skin";
import { Container, Sprite, Text, Texture } from "pixi.js";

function approachCircleRadius({
  timeRemaining,
  preempt,
  radius,
}: {
  timeRemaining: number;
  preempt: number;
  radius: number;
}) {
  const progress = Math.min(Math.max(1 - timeRemaining / preempt, 0), 1); // Clamped between 0 and 1
  const approachRadius = (3 - 2 * progress) * radius;

  return approachRadius;
}

export class HitCircle extends Container {
  hitCircle: Sprite | undefined;
  hitCircleOverlay: Sprite | undefined;
  hitCircleText: Text | undefined;
  approachCircle: Sprite | undefined;
  time: number;
  resultTime: number;
  radius: number;
  preempt: number;
  comboColorIndex: number;
  private skin: Skin;
  constructor({
    x,
    y,
    time,
    resultTime,
    number,
    comboColorIndex,
    comboColors,
    radius,
    preempt,
    skin,
  }: {
    x: number;
    y: number;
    time: number;
    resultTime: number;
    number: number;
    comboColorIndex: number;
    comboColors: number[];
    radius: number;
    preempt: number;
    skin: Skin;
  }) {
    super();
    this.time = time;
    this.resultTime = resultTime;
    this.radius = radius;
    this.preempt = preempt;
    this.comboColorIndex = comboColorIndex;
    this.skin = skin;

    const color = comboColors[comboColorIndex % comboColors.length];
    const { textures } = skin;

    this.hitCircle = new Sprite({
      texture: textures.hitcircle ?? Texture.EMPTY,
      x,
      y,
      width: radius * 2,
      height: radius * 2,
      tint: color,
      anchor: 0.5,
    });
    this.addChild(this.hitCircle);

    this.hitCircleOverlay = new Sprite({
      texture: textures.hitcircleoverlay ?? Texture.EMPTY,
      x,
      y,
      width: radius * 2,
      height: radius * 2,
      anchor: 0.5,
    });
    this.addChild(this.hitCircleOverlay);

    this.hitCircleText = new Text({
      text: number,
      x,
      y,
      anchor: 0.5,
      style: { fill: 0xffffff, fontSize: radius / 2 },
    });
    this.addChild(this.hitCircleText);

    this.approachCircle = new Sprite({
      texture: textures.approachcircle ?? Texture.EMPTY,
      x,
      y,
      width: radius * 2 * 4,
      height: radius * 2 * 4,
      tint: color,
      zIndex: -1,
      anchor: 0.5,
    });
    this.addChild(this.approachCircle);
  }

  updateColor(comboColors: number[]): void {
    const color = comboColors[this.comboColorIndex % comboColors.length];
    if (this.hitCircle) this.hitCircle.tint = color;
    if (this.approachCircle) this.approachCircle.tint = color;
  }

  updateTextures(): void {
    const { textures } = this.skin;
    if (this.hitCircle) {
      this.hitCircle.texture = textures.hitcircle ?? Texture.EMPTY;
    }
    if (this.hitCircleOverlay) {
      this.hitCircleOverlay.texture =
        textures.hitcircleoverlay ?? Texture.EMPTY;
    }
    if (this.approachCircle) {
      this.approachCircle.texture = textures.approachcircle ?? Texture.EMPTY;
    }
  }

  update(time: number): void {
    const radius = approachCircleRadius({
      timeRemaining: this.time - time,
      preempt: this.preempt,
      radius: this.radius,
    });
    this.approachCircle?.setSize(radius * 2, radius * 2);
  }
}
