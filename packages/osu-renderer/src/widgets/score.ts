import { Container, Text } from "pixi.js";
import type { SimulatedFrame } from "osu-simulation";
import type { Widget, WidgetContext, WidgetFactory } from "./widget";

class ScoreWidget extends Container {
  private readonly scoreText: Text;

  constructor({ scale }: WidgetContext) {
    super();
    this.scoreText = new Text({
      text: "00000000",
      style: {
        fill: 0xffffff,
        fontSize: 18 * scale,
        fontFamily: "Courier New, monospace",
        dropShadow: {
          alpha: 0.6,
          angle: Math.PI / 4,
          blur: 2 * scale,
          color: 0x000000,
          distance: 1.5 * scale,
        },
      },
      // anchor (1, 0) places the text's top-right corner at (0, 0) in local
      // space, satisfying the Widget convention for origin: 'top-right'.
      anchor: { x: 1, y: 0 },
    });
    this.addChild(this.scoreText);
  }

  update(frame: SimulatedFrame, _time: number): void {
    this.scoreText.text = frame.score.toString().padStart(8, "0");
  }
}

/**
 * Displays the current score as an 8-digit zero-padded number.
 *
 * Intended placement: `{ x: 5, y: 5, anchor: 'top-right', origin: 'top-right' }`
 */
export const scoreWidget: WidgetFactory = (context) => new ScoreWidget(context) as Widget;
