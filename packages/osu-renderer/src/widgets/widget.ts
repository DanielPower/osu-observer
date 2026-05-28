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
  /** Resolved canvas-space X position of this widget's anchor point. */
  canvasX: number;
  /** Resolved canvas-space Y position of this widget's anchor point. */
  canvasY: number;
};

export type Widget = {
  draw(ctx: CanvasRenderingContext2D, frame: SimulatedFrame, time: number): void;
};

export type WidgetFactory = (context: WidgetContext) => Widget;

export type WidgetConfig = {
  /** Distance from the anchor edge, in game units (640×480 space). */
  x: number;
  y: number;
  anchor: AnchorPoint;
  /**
   * Which corner of the widget aligns with the resolved canvas position.
   * This is a documentation convention for the widget author — the renderer
   * does not interpret it; the widget's draw() implementation is responsible
   * for aligning its content accordingly.
   */
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
