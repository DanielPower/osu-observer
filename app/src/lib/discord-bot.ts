import { Client, Events, GatewayIntentBits, type Message, Partials } from "discord.js";
import { SITE_URL } from "../env";
import { findScoreIds } from "./discord-score-links";
import { hasPlayableReplay } from "./osu-api";

async function replyWithObserverLinks(message: Message) {
  if (message.author.bot) return;
  const scoreIds = findScoreIds(message.content);
  if (scoreIds.length === 0) return;

  // One at a time, to go easy on the osu! API when a message holds several links.
  const playable: string[] = [];
  for (const scoreId of scoreIds) {
    // oxlint-disable-next-line no-await-in-loop
    if (await hasPlayableReplay(scoreId)) playable.push(scoreId);
  }
  if (playable.length === 0) return;

  await message.reply({
    content: playable.map((scoreId) => `${SITE_URL}/score/${scoreId}`).join("\n"),
    allowedMentions: { repliedUser: false },
  });
}

export function startDiscordBot(token: string) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    // Direct message channels aren't cached, so their messages arrive as partials.
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, (ready) => {
    console.log(`Discord bot logged in as ${ready.user.tag}`);
  });
  client.on(Events.MessageCreate, (message) => {
    replyWithObserverLinks(message).catch((error: unknown) => {
      console.error(`Discord bot failed to answer message ${message.id}`, error);
    });
  });
  client.on(Events.Error, (error) => console.error("Discord bot error", error));

  client.login(token).catch((error: unknown) => {
    console.error("Discord bot failed to log in", error);
  });
}
