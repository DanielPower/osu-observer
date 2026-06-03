import type { WidgetFactory } from "./widget";

export const scorebarBgWidget: WidgetFactory = (widgetContext) => {
  return {
    draw(ctx) {
      const image = widgetContext.images["scorebar-bg"];
      if (!image) return;

      const scale = widgetContext.height / 768;
      ctx.drawImage(image, 0, 0, image.width * scale, image.height * scale);
    },
  };
};
