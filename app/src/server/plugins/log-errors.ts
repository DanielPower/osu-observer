import { definePlugin } from "nitro";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("error", (error, context) => {
    const request = context.event
      ? `${context.event.req.method} ${new URL(context.event.req.url).pathname}`
      : "outside a request";
    const tags = context.tags?.length ? ` [${context.tags.join(", ")}]` : "";
    console.error(`[server error] ${request}${tags}`, error);
  });
});
