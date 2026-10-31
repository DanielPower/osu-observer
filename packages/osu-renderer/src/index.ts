export {
  simulateScore,
  isInside,
  frameAt,
  type Simulation,
  type SimulatedFrame,
  type SimulatedFrames,
  type HitObject,
  type ClickStats,
  type SliderData,
  type Coordinate,
  type HitCircle,
} from "osu-simulation";

export {
  calcPreempt,
  calcFade,
  calcAlpha,
  calcObjectRadius,
  calcCursorSize,
  lerp2D,
  getSpinsRequired,
  PLAYFIELD,
  GAME,
} from "./math";

export {
  SKIN_KEYS,
  loadSkinImages,
  skinFilesToImageUrls,
  type SkinKey,
  type SkinImages,
} from "./skin";
export { loadSkinFiles } from "./skin-loader";

export { createRenderer, type Renderer } from "./renderer/renderer";
export {
  RESULT_COLORS as JUDGEMENT_COLORS,
  type JudgementMarker,
} from "./renderer/cursor-analysis";
export { scoreWidget } from "./widgets/score";
export { accuracyWidget } from "./widgets/accuracy";
export { comboWidget } from "./widgets/combo";
export { scorebarWidget } from "./widgets/scorebar";
export { createSkinTextWidget } from "./widgets/skin-text";

export type {
  Widget,
  WidgetFactory,
  WidgetConfig,
  WidgetContext,
  AnchorPoint,
} from "./widgets/widget";
