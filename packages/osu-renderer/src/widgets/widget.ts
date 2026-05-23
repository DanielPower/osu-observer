import type { Container } from "pixi.js";
import type { SimulatedFrame, Simulation } from "osu-simulation";
import type { StandardBeatmap } from "osu-standard-stable";

export type AnchorPoint = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

/**
 * Provided to every widget factory when the renderer instantiates it.
 * Gives widgets access to the renderer scale and the full beatmap/simulation
 * data they may need to initialise their display.
 */
export type WidgetContext = {
  scale: number;
  width: number;
  height: number;
  beatmap: StandardBeatmap;
  simulation: Simulation;
};

/**
 * A Pixi Container that updates itself once per frame.
 *
 * Convention: the widget's internal (0, 0) must sit at the point described
 * by its `origin` in the WidgetConfig. The renderer places the container at
 * the resolved canvas position without any additional offset — so if a widget
 * declares `origin: 'top-right'`, its Pixi children must be arranged so that
 * the top-right corner of the widget lies at (0, 0) in local coordinates
 * (e.g. by setting `text.anchor.set(1, 0)` for a right-aligned Text).
 */
export type Widget = Container & {
  update(frame: SimulatedFrame, time: number): void;
};

/** Creates a Widget given the renderer context. */
export type WidgetFactory = (context: WidgetContext) => Widget;

export type WidgetConfig = {
  /** Distance from the anchor edge, measured inward, in game units (640×480 space). */
  x: number;
  /** Distance from the anchor edge, measured inward, in game units (640×480 space). */
  y: number;
  /**
   * Which corner/edge of the canvas x/y are measured from.
   * For right/bottom anchors x/y are implicitly negated so positive values
   * always point toward the canvas interior.
   */
  anchor: AnchorPoint;
  /**
   * Which point of the widget is placed at the resolved canvas position.
   * Must match the widget's internal (0, 0) — see Widget convention above.
   */
  origin: AnchorPoint;
  widget: WidgetFactory;
};

/**
 * Resolves (anchor, x, y) into a canvas-space position.
 * x/y are in game units (640×480 space) and are scaled to canvas pixels.
 * Positive x/y always point inward from the anchor edge.
 */
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
