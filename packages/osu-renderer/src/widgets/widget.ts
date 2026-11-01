import type { SimulatedFrame, Simulation } from "osu-simulation";
import type { StandardBeatmap } from "osu-standard-stable";
import type { SkinImages } from "../skin";

export type AnchorPoint =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** Where an anchor point sits, as fractions of the width and height (0, 0.5 or 1). */
export function anchorFraction(anchor: AnchorPoint): { x: number; y: number } {
  const [vertical, horizontal = "center"] = anchor === "center" ? ["center"] : anchor.split("-");
  const fraction = (side: string) =>
    side === "left" || side === "top" ? 0 : side === "right" || side === "bottom" ? 1 : 0.5;
  return { x: fraction(horizontal), y: fraction(vertical) };
}

export type WidgetContext = {
  scale: number;
  width: number;
  height: number;
  beatmap: StandardBeatmap;
  simulation: Simulation;
  images: SkinImages;
  canvasX: number;
  canvasY: number;
  /** The point of the widget that sits at (canvasX, canvasY). */
  origin: AnchorPoint;
};

export type Widget = {
  draw(ctx: CanvasRenderingContext2D, frame: SimulatedFrame, time: number): void;
};

export type WidgetFactory = (context: WidgetContext) => Widget;

export type WidgetConfig = {
  x: number;
  y: number;
  anchor: AnchorPoint;
  origin: AnchorPoint;
  widget: WidgetFactory;
};

export function resolvePosition(
  anchor: AnchorPoint,
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
): { x: number; y: number } {
  const fraction = anchorFraction(anchor);
  const xSign = fraction.x === 1 ? -1 : 1;
  const ySign = fraction.y === 1 ? -1 : 1;
  return {
    x: canvasWidth * fraction.x + x * scale * xSign,
    y: canvasHeight * fraction.y + y * scale * ySign,
  };
}
