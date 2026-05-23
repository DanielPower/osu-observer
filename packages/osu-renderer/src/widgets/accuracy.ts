import { Container, Text } from "pixi.js";
import type { SimulatedFrame } from "osu-simulation";
import type { Widget, WidgetContext, WidgetFactory } from "./widget";

class AccuracyWidget extends Container {
  private readonly accuracyText: Text;

  constructor({ scale }: WidgetContext) {
    super();
    this.accuracyText = new Text({
      text: "100.00%",
      style: {
        fill: 0xffffff,
        fontSize: 12 * scale,
        fontFamily: "Courier New, monospace",
        dropShadow: {
          alpha: 0.6,
          angle: Math.PI / 4,
          blur: 2 * scale,
          color: 0x000000,
          distance: 1.5 * scale,
        },
      },
      anchor: { x: 1, y: 0 },
    });
    this.addChild(this.accuracyText);
  }

  update(frame: SimulatedFrame, _time: number): void {
    this.accuracyText.text = `${(frame.accuracy * 100).toFixed(2)}%`;
  }
}

export const accuracyWidget: WidgetFactory = (context) => new AccuracyWidget(context) as Widget;
