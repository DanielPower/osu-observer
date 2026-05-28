import type { SimulatedFrame, Simulation } from "osu-simulation";
import type { StandardBeatmap } from "osu-standard-stable";
import type { SkinImages } from "../skin";

export type AnchorPoint = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

export type WidgetContext = {
  scale: number;
  width: number;
  height: number;
  beatmap: StandardBeatmap;
  simulation: Simulation;
  images: SkinImages;
  canvasX: number;
  canvasY: number;
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
  const isRight = anchor === "top-right" || anchor === "bottom-right";
  const isBottom = anchor === "bottom-left" || anchor === "bottom-right";
  const isCenter = anchor === "center";

  const baseX = isCenter ? canvasWidth / 2 : isRight ? canvasWidth : 0;
  const baseY = isCenter ? canvasHeight / 2 : isBottom ? canvasHeight : 0;
  const xSign = isRight ? -1 : 1;
  const ySign = isBottom ? -1 : 1;

  return { x: baseX + x * scale * xSign, y: baseY + y * scale * ySign };
}
