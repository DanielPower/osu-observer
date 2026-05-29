import type { WidgetFactory } from "./widget";
import type { SkinKey } from "../skin";
import { createSkinTextWidget } from "./skin-text";

export const accuracyWidget: WidgetFactory = (context) =>
  createSkinTextWidget(
    context,
    true,
    0,
    (char) => {
      if (char === ".") return context.images["score-dot"];
      if (char === "%") return context.images["score-percent"];
      return context.images[`score-${char}` as SkinKey];
    },
    (frame) => `${(frame.accuracy * 100).toFixed(2)}%`,
  );
