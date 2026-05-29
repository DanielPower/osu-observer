import type { WidgetFactory } from "./widget";
import { drawSprite } from "../renderer/draw";

export const scorebarBgWidget: WidgetFactory = (widgetContext) => {
  return {
    draw(ctx) {
      const image = widgetContext.images["scorebar-bg"];
      if (!image) return;
      const scorebarScale = widgetContext.width / image.width;
      const height = image.height * scorebarScale;
      drawSprite(ctx, image, widgetContext.width / 2, height / 2, widgetContext.width, height);
    },
  };
};
