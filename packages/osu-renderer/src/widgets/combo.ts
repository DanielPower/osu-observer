import type { WidgetFactory } from "./widget";
import type { SkinKey } from "../skin";
import { createSkinTextWidget } from "./skin-text";

export const comboWidget: WidgetFactory = (context) =>
  createSkinTextWidget(
    context,
    /* rightAlign */ false,
    /* anchorY */ 1,
    (char) => {
      if (char === "x") return context.images["score-x"];
      return context.images[`score-${char}` as SkinKey];
    },
    (frame) => `${frame.combo}x`,
  );
