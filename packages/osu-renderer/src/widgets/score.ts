import type { WidgetFactory } from "./widget";
import type { SkinKey } from "../skin";
import { createSkinTextWidget } from "./skin-text";

export const scoreWidget: WidgetFactory = (context) =>
  createSkinTextWidget(
    context,
    true,
    0,
    (char) =>
      context.images[`score-${char}` as SkinKey] ?? context.images[`default-${char}` as SkinKey],
    (frame) => frame.score.toString(),
  );
