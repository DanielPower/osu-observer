import { definePlugin } from "nitro";
import { DISCORD_BOT_TOKEN } from "../../env";
import { startDiscordBot } from "../../lib/discord-bot";

export default definePlugin(() => {
  if (!DISCORD_BOT_TOKEN) return;
  startDiscordBot(DISCORD_BOT_TOKEN);
});
