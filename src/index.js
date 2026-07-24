require("dotenv").config();

const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const { getDataFilePath, getGuildId } = require("./config");
const { buildCommands, handleInteraction } = require("./commands");
const { startHealthServer } = require("./health");
const { JsonStore } = require("./storage");
const { startNotificationLoop } = require("./notifications");
const logger = require("./logger");

async function registerGuildCommands(client, guildId) {
  const commands = buildCommands().map((command) => command.toJSON());
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const applicationId = client.application?.id || client.user.id;

  await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
    body: commands
  });

  logger.info(`Registrati ${commands.length} comandi slash per guild ${guildId}`);
}

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN mancante. Configuralo in .env o su Railway.");
  }

  const store = new JsonStore(getDataFilePath());
  await store.load();

  const guildId = store.snapshot().guildId || getGuildId();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once("ready", async () => {
    logger.info(`Online come ${client.user.tag}`);
    await registerGuildCommands(client, guildId);
    startHealthServer(store);
    startNotificationLoop(client, store);
  });

  client.on("interactionCreate", async (interaction) => {
    await handleInteraction(interaction, store);
  });

  client.on("error", (error) => {
    logger.error("Discord client error", error);
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT ricevuto, chiusura bot.");
    client.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERM ricevuto, chiusura bot.");
    client.destroy();
    process.exit(0);
  });

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((error) => {
  logger.error(error.message, error);
  process.exit(1);
});
