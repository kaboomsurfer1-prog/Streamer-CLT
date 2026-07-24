const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { DEFAULT_TEMPLATES } = require("./config");
const { buildFeedUrl } = require("./providers/rss");
const { assertSafeExternalUrl } = require("./urlSafety");
const {
  defaultPlatformUrl,
  describeSource,
  formatMessage,
  platformLabel
} = require("./messages");
const { sendManualNotification, sendTestNotification } = require("./notifications");

const TYPES = [
  { name: "Live", value: "live" },
  { name: "Video", value: "video" }
];

const PLATFORMS = [
  { name: "Twitch", value: "twitch" },
  { name: "YouTube", value: "youtube" },
  { name: "TikTok", value: "tiktok" },
  { name: "Kick", value: "kick" },
  { name: "Facebook", value: "facebook" },
  { name: "Instagram", value: "instagram" },
  { name: "Trovo", value: "trovo" },
  { name: "Rumble", value: "rumble" },
  { name: "X Twitter", value: "x" },
  { name: "RSS", value: "rss" }
];

const LIVE_NATIVE_PLATFORMS = new Set(["twitch", "youtube", "kick"]);
const LIVE_PLATFORMS = PLATFORMS.filter((platform) => platform.value !== "rss");
const VIDEO_PLATFORMS = PLATFORMS;

function addTypeOption(option) {
  return option
    .setName("tip")
    .setDescription("Tipul notificarii")
    .setRequired(true)
    .addChoices(...TYPES);
}

function addOptionalTypeOption(option) {
  return option
    .setName("tip")
    .setDescription("Tipul notificarii")
    .setRequired(false)
    .addChoices(...TYPES);
}

function addPlatformOption(option) {
  return option
    .setName("platforma")
    .setDescription("Platforma care trebuie verificata")
    .setRequired(true)
    .addChoices(...PLATFORMS);
}

function addOptionalPlatformOption(option) {
  return option
    .setName("platforma")
    .setDescription("Platforma care trebuie verificata")
    .setRequired(false)
    .addChoices(...PLATFORMS);
}

function addLivePlatformOption(option) {
  return option
    .setName("platforma")
    .setDescription("Platforma live")
    .setRequired(true)
    .addChoices(...LIVE_PLATFORMS);
}

function addVideoPlatformOption(option) {
  return option
    .setName("platforma")
    .setDescription("Platforma video")
    .setRequired(true)
    .addChoices(...VIDEO_PLATFORMS);
}

function addTextChannelOption(option, required = true) {
  return option
    .setName("canal")
    .setDescription("Canalul Discord unde se trimit notificarile")
    .setRequired(required)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
}

function addFeedOption(option) {
  return option
    .setName("feed")
    .setDescription("Feed RSS/Atom https pentru video sau platforme fara API")
    .setRequired(false)
    .setMaxLength(500);
}

function buildCommands() {
  const live = new SlashCommandBuilder()
    .setName("live")
    .setDescription("Adauga o sursa live si alege canalul de notificari")
    .addStringOption(addLivePlatformOption)
    .addStringOption((option) =>
      option
        .setName("utilizator")
        .setDescription("Username, handle sau channel id")
        .setRequired(true)
        .setMaxLength(120)
    )
    .addChannelOption((option) => addTextChannelOption(option, true))
    .addStringOption((option) =>
      option
        .setName("nume")
        .setDescription("Numele afisat in mesaj")
        .setRequired(false)
        .setMaxLength(120)
    )
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("URL profil, live sau canal")
        .setRequired(false)
        .setMaxLength(500)
    )
    .addStringOption((option) =>
      option
        .setName("mesaj")
        .setDescription("Template doar pentru aceasta sursa live")
        .setRequired(false)
        .setMaxLength(1500)
    )
    .addRoleOption((option) =>
      option
        .setName("rol_ping")
        .setDescription("Rolul mentionat in notificari")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("notifica_imediat")
        .setDescription("Trimite si live-ul deja pornit la prima verificare")
        .setRequired(false)
    );

  const video = new SlashCommandBuilder()
    .setName("video")
    .setDescription("Adauga o sursa video si alege canalul de notificari")
    .addStringOption(addVideoPlatformOption)
    .addStringOption((option) =>
      option
        .setName("utilizator")
        .setDescription("Username, handle, channel id YouTube sau numele sursei")
        .setRequired(true)
        .setMaxLength(120)
    )
    .addChannelOption((option) => addTextChannelOption(option, true))
    .addStringOption((option) =>
      option
        .setName("nume")
        .setDescription("Numele afisat in mesaj")
        .setRequired(false)
        .setMaxLength(120)
    )
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("URL profil sau canal")
        .setRequired(false)
        .setMaxLength(500)
    )
    .addStringOption(addFeedOption)
    .addStringOption((option) =>
      option
        .setName("mesaj")
        .setDescription("Template doar pentru aceasta sursa video")
        .setRequired(false)
        .setMaxLength(1500)
    )
    .addRoleOption((option) =>
      option
        .setName("rol_ping")
        .setDescription("Rolul mentionat in notificari")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("notifica_imediat")
        .setDescription("Trimite si ultimul video gasit la prima verificare")
        .setRequired(false)
    );
  const streamer = new SlashCommandBuilder()
    .setName("streamer")
    .setDescription("Gestioneaza streamerii si sursele video")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("adauga")
        .setDescription("Adauga o sursa noua")
        .addStringOption(addTypeOption)
        .addStringOption(addPlatformOption)
        .addStringOption((option) =>
          option
            .setName("utilizator")
            .setDescription("Username, handle, channel id YouTube sau numele sursei")
            .setRequired(true)
            .setMaxLength(120)
        )
        .addChannelOption((option) => addTextChannelOption(option, false))
        .addStringOption((option) =>
          option
            .setName("nume")
            .setDescription("Numele afisat in mesaj")
            .setRequired(false)
            .setMaxLength(120)
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("URL profil, live sau canal")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption(addFeedOption)
        .addStringOption((option) =>
          option
            .setName("mesaj")
            .setDescription("Template doar pentru aceasta sursa")
            .setRequired(false)
            .setMaxLength(1500)
        )
        .addRoleOption((option) =>
          option
            .setName("rol_ping")
            .setDescription("Rolul mentionat in notificari")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("notifica_imediat")
            .setDescription("Trimite si continutul deja live/publicat la prima verificare")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("modifica")
        .setDescription("Modifica o sursa existenta")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID-ul sursei")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(addOptionalTypeOption)
        .addStringOption(addOptionalPlatformOption)
        .addStringOption((option) =>
          option
            .setName("utilizator")
            .setDescription("Noul username, handle, channel id sau nume de sursa")
            .setRequired(false)
            .setMaxLength(120)
        )
        .addChannelOption((option) => addTextChannelOption(option, false))
        .addStringOption((option) =>
          option
            .setName("nume")
            .setDescription("Noul nume afisat")
            .setRequired(false)
            .setMaxLength(120)
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Noul URL profil, live sau canal")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption(addFeedOption)
        .addStringOption((option) =>
          option
            .setName("mesaj")
            .setDescription("Noul template doar pentru aceasta sursa")
            .setRequired(false)
            .setMaxLength(1500)
        )
        .addRoleOption((option) =>
          option
            .setName("rol_ping")
            .setDescription("Noul rol mentionat")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("sterge_ping")
            .setDescription("Sterge rolul ping din aceasta sursa")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("activ")
            .setDescription("Activeaza sau dezactiveaza verificarea automata")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("reset_mesaj")
            .setDescription("Sterge template-ul personalizat")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sterge")
        .setDescription("Sterge o sursa")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID-ul sursei")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lista")
        .setDescription("Afiseaza sursele configurate")
        .addStringOption(addOptionalTypeOption)
        .addStringOption(addOptionalPlatformOption)
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("test")
        .setDescription("Afiseaza sau trimite o notificare de test")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID-ul sursei")
            .setRequired(true)
            .setMinValue(1)
        )
        .addBooleanOption((option) =>
          option
            .setName("trimite")
            .setDescription("Trimite testul in canalul configurat")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("anunta")
        .setDescription("Trimite manual o notificare pentru orice platforma")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID-ul sursei")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((option) =>
          option
            .setName("titlu")
            .setDescription("Titlul afisat in notificare")
            .setRequired(false)
            .setMaxLength(250)
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("URL-ul afisat in notificare")
            .setRequired(false)
            .setMaxLength(500)
        )
    );

  const canal = new SlashCommandBuilder()
    .setName("canal")
    .setDescription("Gestioneaza canalele Discord implicite")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("seteaza")
        .setDescription("Seteaza canalul implicit pentru un tip")
        .addStringOption(addTypeOption)
        .addChannelOption((option) => addTextChannelOption(option, true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sterge")
        .setDescription("Sterge canalul implicit pentru un tip")
        .addStringOption(addTypeOption)
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("arata").setDescription("Afiseaza canalele implicite")
    );

  const mesaj = new SlashCommandBuilder()
    .setName("mesaj")
    .setDescription("Gestioneaza template-urile mesajelor")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("seteaza")
        .setDescription("Seteaza un template global")
        .addStringOption(addTypeOption)
        .addStringOption((option) =>
          option
            .setName("text")
            .setDescription("Template cu placeholder: {creator}, {platform}, {title}, {url}, {mention}")
            .setRequired(true)
            .setMaxLength(1500)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("arata")
        .setDescription("Afiseaza template-urile actuale")
        .addStringOption(addOptionalTypeOption)
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reseteaza un template standard")
        .addStringOption(addTypeOption)
    );

  const roluri = new SlashCommandBuilder()
    .setName("roluri")
    .setDescription("Gestioneaza rolurile autorizate pentru comenzi")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("adauga")
        .setDescription("Autorizeaza un rol")
        .addRoleOption((option) =>
          option.setName("rol").setDescription("Rol autorizat").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sterge")
        .setDescription("Sterge un rol autorizat")
        .addRoleOption((option) =>
          option.setName("rol").setDescription("Rolul care trebuie sters").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("lista").setDescription("Afiseaza rolurile autorizate")
    );

  const status = new SlashCommandBuilder()
    .setName("status")
    .setDescription("Afiseaza statusul botului si configuratia");

  const help = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Afiseaza toate comenzile botului");

  return [live, video, streamer, canal, mesaj, roluri, status, help];
}

function hasAllowedRole(interaction, allowedRoleIds) {
  if (!interaction.inGuild()) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;

  const roles = interaction.member?.roles;
  if (!roles) return false;
  if (roles.cache) {
    return allowedRoleIds.some((roleId) => roles.cache.has(roleId));
  }

  if (Array.isArray(roles)) {
    return allowedRoleIds.some((roleId) => roles.includes(roleId));
  }

  return false;
}

async function ensureAuthorized(interaction, store) {
  const allowedRoleIds = store.snapshot().allowedRoleIds;
  if (hasAllowedRole(interaction, allowedRoleIds)) return true;

  await interaction.reply({
    content: "Nu ai permisiunea sa folosesti aceasta comanda.",
    ephemeral: true
  });
  return false;
}

function isManualOnlySource(source) {
  return source.type === "live" && !LIVE_NATIVE_PLATFORMS.has(source.platform);
}

async function validateSourceInput(input) {
  if (input.feedUrl) {
    await assertSafeExternalUrl(input.feedUrl);
  }

  if (input.type === "live") {
    return null;
  }

  if (input.type !== "video") {
    return "Tipul sursei nu este valid.";
  }

  if (input.feedUrl) return null;

  if (input.platform === "youtube") {
    try {
      buildFeedUrl(input);
      return null;
    } catch (error) {
      if (process.env.YOUTUBE_API_KEY) return null;
      return `${error.message} Sau seteaza YOUTUBE_API_KEY pe Railway.`;
    }
  }

  if (input.platform === "tiktok") {
    return null;
  }

  return `Pentru video ${platformLabel(input.platform)} trebuie campul feed cu un RSS/Atom https permis.`;
}

function findSource(store, id) {
  return store.snapshot().sources.find((source) => source.id === Number(id)) || null;
}

function sourcePreview(store, source) {
  const data = store.snapshot();
  const template = source.customMessage || data.templates[source.type] || DEFAULT_TEMPLATES[source.type];
  const event = {
    title: "Notificare de test",
    url: source.url || defaultPlatformUrl(source.platform, source.username),
    publishedAt: new Date().toISOString(),
    startedAt: new Date().toISOString()
  };
  return formatMessage(template, source, event);
}

function sourceListText(sources) {
  if (sources.length === 0) return "Nu exista surse configurate.";
  const lines = sources.slice(0, 25).map(describeSource);
  if (sources.length > 25) {
    lines.push(`... inca ${sources.length - 25} surse nu sunt afisate.`);
  }
  return lines.join("\n");
}

function sourceModeNote(source) {
  if (!source.manualOnly) return "";
  return "\nAceasta platforma live este setata manual: foloseste /streamer anunta cand intra live.";
}

async function addSourceFromDirectCommand(interaction, store, type) {
  const platform = interaction.options.getString("platforma", true);
  const username = interaction.options.getString("utilizator", true).trim();
  const channel = interaction.options.getChannel("canal", true);
  const displayName = interaction.options.getString("nume")?.trim() || username;
  const url = interaction.options.getString("url")?.trim() || null;
  const feedUrl = type === "video" ? interaction.options.getString("feed")?.trim() || null : null;
  const customMessage = interaction.options.getString("mesaj")?.trim() || null;
  const mentionRole = interaction.options.getRole("rol_ping");
  const notifyOnFirstCheck = interaction.options.getBoolean("notifica_imediat") === true;

  const input = {
    type,
    platform,
    username,
    displayName,
    channelId: channel.id,
    mentionRoleId: mentionRole?.id || null,
    url,
    feedUrl,
    customMessage,
    enabled: true,
    manualOnly: false,
    cursorReady: false,
    notifyOnFirstCheck
  };

  input.manualOnly = isManualOnlySource(input);
  if (input.manualOnly) input.enabled = false;

  const validationError = await validateSourceInput(input);
  if (validationError) {
    await interaction.reply({ content: validationError, ephemeral: true });
    return;
  }

  const source = await store.addSource(input);
  await interaction.reply({
    content: `Sursa ${type} adaugata: ${describeSource(source)}${sourceModeNote(source)}`,
    ephemeral: true
  });
}

async function handleStreamer(interaction, store) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "adauga") {
    const type = interaction.options.getString("tip", true);
    const platform = interaction.options.getString("platforma", true);
    const username = interaction.options.getString("utilizator", true).trim();
    const channel = interaction.options.getChannel("canal");
    const displayName = interaction.options.getString("nume")?.trim() || username;
    const url = interaction.options.getString("url")?.trim() || null;
    const feedUrl = interaction.options.getString("feed")?.trim() || null;
    const customMessage = interaction.options.getString("mesaj")?.trim() || null;
    const mentionRole = interaction.options.getRole("rol_ping");
    const notifyOnFirstCheck = interaction.options.getBoolean("notifica_imediat") === true;
    const defaults = store.snapshot().defaultChannels;

    const input = {
      type,
      platform,
      username,
      displayName,
      channelId: channel?.id || defaults[type] || null,
      mentionRoleId: mentionRole?.id || null,
      url,
      feedUrl,
      customMessage,
      enabled: true,
      manualOnly: false,
      cursorReady: false,
      notifyOnFirstCheck
    };

    input.manualOnly = isManualOnlySource(input);
    if (input.manualOnly) input.enabled = false;

    if (!input.channelId) {
      await interaction.reply({
        content: "Alege un canal sau seteaza mai intai un canal implicit cu /canal seteaza.",
        ephemeral: true
      });
      return;
    }

    const validationError = await validateSourceInput(input);
    if (validationError) {
      await interaction.reply({ content: validationError, ephemeral: true });
      return;
    }

    const source = await store.addSource(input);
    await interaction.reply({
      content: `Sursa adaugata: ${describeSource(source)}${sourceModeNote(source)}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "modifica") {
    const id = interaction.options.getInteger("id", true);
    const source = findSource(store, id);
    if (!source) {
      await interaction.reply({ content: `Sursa #${id} nu a fost gasita.`, ephemeral: true });
      return;
    }

    const patch = {};
    const cursorFields = ["tip", "platforma", "utilizator", "feed", "url"];

    const type = interaction.options.getString("tip");
    const platform = interaction.options.getString("platforma");
    const username = interaction.options.getString("utilizator")?.trim();
    const channel = interaction.options.getChannel("canal");
    const displayName = interaction.options.getString("nume")?.trim();
    const url = interaction.options.getString("url")?.trim();
    const feedUrl = interaction.options.getString("feed")?.trim();
    const customMessage = interaction.options.getString("mesaj")?.trim();
    const mentionRole = interaction.options.getRole("rol_ping");
    const removePing = interaction.options.getBoolean("sterge_ping");
    const enabled = interaction.options.getBoolean("activ");
    const resetMessage = interaction.options.getBoolean("reset_mesaj");

    if (type) patch.type = type;
    if (platform) patch.platform = platform;
    if (username) patch.username = username;
    if (channel) patch.channelId = channel.id;
    if (displayName) patch.displayName = displayName;
    if (url !== undefined) patch.url = url || null;
    if (feedUrl !== undefined) patch.feedUrl = feedUrl || null;
    if (customMessage !== undefined) patch.customMessage = customMessage || null;
    if (mentionRole) patch.mentionRoleId = mentionRole.id;
    if (removePing === true) patch.mentionRoleId = null;
    if (enabled !== null) patch.enabled = enabled;
    if (resetMessage === true) patch.customMessage = null;

    const merged = { ...source, ...patch };
    merged.manualOnly = isManualOnlySource(merged);
    patch.manualOnly = merged.manualOnly;
    if (merged.manualOnly) patch.enabled = false;

    const validationError = await validateSourceInput(merged);
    if (validationError) {
      await interaction.reply({ content: validationError, ephemeral: true });
      return;
    }

    const cursorChanged = cursorFields.some((field) => interaction.options.get(field) !== null);
    if (cursorChanged) {
      patch.cursorReady = false;
      patch.lastEventId = null;
      patch.notifyOnFirstCheck = false;
    }

    const updated = await store.updateSource(id, patch);
    await interaction.reply({
      content: `Sursa actualizata: ${describeSource(updated)}${sourceModeNote(updated)}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "sterge") {
    const id = interaction.options.getInteger("id", true);
    const removed = await store.removeSource(id);
    await interaction.reply({
      content: removed ? `Sursa stearsa: ${describeSource(removed)}` : `Sursa #${id} nu a fost gasita.`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "lista") {
    const type = interaction.options.getString("tip");
    const platform = interaction.options.getString("platforma");
    const data = store.snapshot();
    const sources = data.sources.filter((source) => {
      if (type && source.type !== type) return false;
      if (platform && source.platform !== platform) return false;
      return true;
    });

    await interaction.reply({
      content: sourceListText(sources),
      ephemeral: true
    });
    return;
  }

  if (subcommand === "test") {
    const id = interaction.options.getInteger("id", true);
    const send = interaction.options.getBoolean("trimite") === true;
    const source = findSource(store, id);
    if (!source) {
      await interaction.reply({ content: `Sursa #${id} nu a fost gasita.`, ephemeral: true });
      return;
    }

    if (send) {
      await sendTestNotification(interaction.client, store, source);
      await interaction.reply({ content: "Notificarea de test a fost trimisa.", ephemeral: true });
      return;
    }

    await interaction.reply({
      content: `Previzualizare:\n${sourcePreview(store, source)}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "anunta") {
    const id = interaction.options.getInteger("id", true);
    const source = findSource(store, id);
    if (!source) {
      await interaction.reply({ content: `Sursa #${id} nu a fost gasita.`, ephemeral: true });
      return;
    }

    const title = interaction.options.getString("titlu")?.trim() || null;
    const url = interaction.options.getString("url")?.trim() || null;
    await sendManualNotification(interaction.client, store, source, { title, url });
    await interaction.reply({ content: "Notificarea manuala a fost trimisa.", ephemeral: true });
  }
}

async function handleCanal(interaction, store) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "seteaza") {
    const type = interaction.options.getString("tip", true);
    const channel = interaction.options.getChannel("canal", true);
    const channels = await store.setDefaultChannel(type, channel.id);
    await interaction.reply({
      content: `Canal implicit ${type}: <#${channels[type]}>`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "sterge") {
    const type = interaction.options.getString("tip", true);
    await store.setDefaultChannel(type, null);
    await interaction.reply({
      content: `Canalul implicit ${type} a fost sters.`,
      ephemeral: true
    });
    return;
  }

  const channels = store.snapshot().defaultChannels;
  await interaction.reply({
    content: `Live: ${channels.live ? `<#${channels.live}>` : "nesetat"}\nVideo: ${
      channels.video ? `<#${channels.video}>` : "nesetat"
    }`,
    ephemeral: true
  });
}

async function handleMesaj(interaction, store) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "seteaza") {
    const type = interaction.options.getString("tip", true);
    const text = interaction.options.getString("text", true);
    await store.setTemplate(type, text);
    await interaction.reply({
      content: `Template-ul ${type} a fost actualizat.\nPlaceholder: {mention}, {creator}, {username}, {platform}, {type}, {title}, {url}, {channel}, {publishedAt}, {startedAt}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "reset") {
    const type = interaction.options.getString("tip", true);
    const template = await store.resetTemplate(type);
    await interaction.reply({
      content: `Template-ul ${type} a fost resetat:\n${template}`,
      ephemeral: true
    });
    return;
  }

  const type = interaction.options.getString("tip");
  const templates = store.snapshot().templates;
  const lines = type
    ? [`${type}: ${templates[type]}`]
    : [`live: ${templates.live}`, `video: ${templates.video}`];

  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: true
  });
}

async function handleRoluri(interaction, store) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "adauga") {
    const role = interaction.options.getRole("rol", true);
    const roles = await store.addAllowedRole(role.id);
    await interaction.reply({
      content: `Rol autorizat: <@&${role.id}>\nTotal roluri: ${roles.length}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "sterge") {
    const role = interaction.options.getRole("rol", true);
    const roles = await store.removeAllowedRole(role.id);
    await interaction.reply({
      content: `Rol sters: <@&${role.id}>\nTotal roluri: ${roles.length}`,
      ephemeral: true
    });
    return;
  }

  const roles = store.snapshot().allowedRoleIds;
  await interaction.reply({
    content: roles.length ? roles.map((roleId) => `<@&${roleId}>`).join("\n") : "Nu exista roluri configurate.",
    ephemeral: true
  });
}

async function handleStatus(interaction, store) {
  const data = store.snapshot();
  const enabled = data.sources.filter((source) => source.enabled && !source.manualOnly).length;
  const manual = data.sources.filter((source) => source.manualOnly).length;
  const total = data.sources.length;
  const live = data.sources.filter((source) => source.type === "live").length;
  const video = data.sources.filter((source) => source.type === "video").length;

  await interaction.reply({
    content: [
      "Bot Streamers CLT este online.",
      `Server: ${data.guildId}`,
      `Surse: ${enabled}/${total} automate, ${manual} manuale (${live} live, ${video} video)`,
      `Interval verificari: ${data.settings.checkIntervalSeconds}s`,
      `Roluri autorizate: ${data.allowedRoleIds.length}`,
      `Canal live: ${data.defaultChannels.live ? `<#${data.defaultChannels.live}>` : "nesetat"}`,
      `Canal video: ${data.defaultChannels.video ? `<#${data.defaultChannels.video}>` : "nesetat"}`,
      `Platforme: ${PLATFORMS.map((item) => platformLabel(item.value)).join(", ")}`
    ].join("\n"),
    ephemeral: true
  });
}

async function handleHelp(interaction) {
  await interaction.reply({
    content: [
      "Comenzi Bot Streamers CLT:",
      "/help - Afiseaza toate comenzile botului.",
      "/live - Adauga o sursa live si selecteaza canalul de notificari.",
      "/video - Adauga o sursa video si selecteaza canalul de notificari.",
      "/status - Afiseaza statusul botului si configuratia.",
      "/canal seteaza - Seteaza canalul implicit pentru live sau video.",
      "/canal arata - Afiseaza canalele implicite.",
      "/canal sterge - Sterge canalul implicit pentru un tip.",
      "/streamer adauga - Adauga o sursa live/video.",
      "/streamer modifica - Modifica o sursa existenta.",
      "/streamer sterge - Sterge o sursa.",
      "/streamer lista - Afiseaza sursele configurate.",
      "/streamer test - Afiseaza sau trimite o notificare de test.",
      "/streamer anunta - Trimite manual o notificare pentru orice platforma.",
      "/mesaj seteaza - Schimba template-ul global pentru live sau video.",
      "/mesaj arata - Afiseaza template-urile actuale.",
      "/mesaj reset - Reseteaza template-ul standard.",
      "/roluri adauga - Autorizeaza un rol pentru comenzi.",
      "/roluri sterge - Sterge un rol autorizat.",
      "/roluri lista - Afiseaza rolurile autorizate."
    ].join("\n"),
    ephemeral: true
  });
}

async function handleInteraction(interaction, store) {
  if (!interaction.isChatInputCommand()) return;
  if (!(await ensureAuthorized(interaction, store))) return;

  try {
    if (interaction.commandName === "live") {
      await addSourceFromDirectCommand(interaction, store, "live");
      return;
    }

    if (interaction.commandName === "video") {
      await addSourceFromDirectCommand(interaction, store, "video");
      return;
    }

    if (interaction.commandName === "streamer") {
      await handleStreamer(interaction, store);
      return;
    }

    if (interaction.commandName === "canal") {
      await handleCanal(interaction, store);
      return;
    }

    if (interaction.commandName === "mesaj") {
      await handleMesaj(interaction, store);
      return;
    }

    if (interaction.commandName === "roluri") {
      await handleRoluri(interaction, store);
      return;
    }

    if (interaction.commandName === "status") {
      await handleStatus(interaction, store);
      return;
    }

    if (interaction.commandName === "help") {
      await handleHelp(interaction);
    }
  } catch (error) {
    const payload = {
      content: `Eroare: ${error.message}`,
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}

module.exports = {
  buildCommands,
  handleInteraction
};