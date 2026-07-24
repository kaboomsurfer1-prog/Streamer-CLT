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

function addTypeOption(option) {
  return option
    .setName("tipo")
    .setDescription("Tipo di notifica")
    .setRequired(true)
    .addChoices(...TYPES);
}

function addOptionalTypeOption(option) {
  return option
    .setName("tipo")
    .setDescription("Tipo di notifica")
    .setRequired(false)
    .addChoices(...TYPES);
}

function addPlatformOption(option) {
  return option
    .setName("piattaforma")
    .setDescription("Piattaforma da controllare")
    .setRequired(true)
    .addChoices(...PLATFORMS);
}

function addOptionalPlatformOption(option) {
  return option
    .setName("piattaforma")
    .setDescription("Piattaforma da controllare")
    .setRequired(false)
    .addChoices(...PLATFORMS);
}

function addTextChannelOption(option, required = true) {
  return option
    .setName("canale")
    .setDescription("Canale Discord dove inviare le notifiche")
    .setRequired(required)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
}

function addFeedOption(option) {
  return option
    .setName("feed")
    .setDescription("Feed RSS/Atom https per video o piattaforme senza API")
    .setRequired(false)
    .setMaxLength(500);
}

function buildCommands() {
  const streamer = new SlashCommandBuilder()
    .setName("streamer")
    .setDescription("Gestisce streamer e sorgenti video")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("aggiungi")
        .setDescription("Aggiunge una nuova sorgente")
        .addStringOption(addTypeOption)
        .addStringOption(addPlatformOption)
        .addStringOption((option) =>
          option
            .setName("utente")
            .setDescription("Username, handle, channel id YouTube o nome sorgente")
            .setRequired(true)
            .setMaxLength(120)
        )
        .addChannelOption((option) => addTextChannelOption(option, false))
        .addStringOption((option) =>
          option
            .setName("nome")
            .setDescription("Nome visualizzato nel messaggio")
            .setRequired(false)
            .setMaxLength(120)
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("URL profilo, live o canale")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption(addFeedOption)
        .addStringOption((option) =>
          option
            .setName("messaggio")
            .setDescription("Template solo per questa sorgente")
            .setRequired(false)
            .setMaxLength(1500)
        )
        .addRoleOption((option) =>
          option
            .setName("ruolo_ping")
            .setDescription("Ruolo da menzionare nelle notifiche")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("notifica_subito")
            .setDescription("Invia anche il contenuto gia live/pubblicato al primo controllo")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("modifica")
        .setDescription("Modifica una sorgente esistente")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID sorgente")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(addOptionalTypeOption)
        .addStringOption(addOptionalPlatformOption)
        .addStringOption((option) =>
          option
            .setName("utente")
            .setDescription("Nuovo username, handle, channel id o nome sorgente")
            .setRequired(false)
            .setMaxLength(120)
        )
        .addChannelOption((option) => addTextChannelOption(option, false))
        .addStringOption((option) =>
          option
            .setName("nome")
            .setDescription("Nuovo nome visualizzato")
            .setRequired(false)
            .setMaxLength(120)
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Nuovo URL profilo, live o canale")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption(addFeedOption)
        .addStringOption((option) =>
          option
            .setName("messaggio")
            .setDescription("Nuovo template solo per questa sorgente")
            .setRequired(false)
            .setMaxLength(1500)
        )
        .addRoleOption((option) =>
          option
            .setName("ruolo_ping")
            .setDescription("Nuovo ruolo da menzionare")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("rimuovi_ping")
            .setDescription("Rimuove il ruolo ping da questa sorgente")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("attivo")
            .setDescription("Attiva o disattiva il controllo automatico")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("reset_messaggio")
            .setDescription("Rimuove il template personalizzato")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rimuovi")
        .setDescription("Rimuove una sorgente")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID sorgente")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lista")
        .setDescription("Mostra le sorgenti configurate")
        .addStringOption(addOptionalTypeOption)
        .addStringOption(addOptionalPlatformOption)
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("test")
        .setDescription("Mostra o invia una notifica di test")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID sorgente")
            .setRequired(true)
            .setMinValue(1)
        )
        .addBooleanOption((option) =>
          option
            .setName("invia")
            .setDescription("Invia davvero il test nel canale configurato")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("annuncia")
        .setDescription("Invia una notifica manuale per qualsiasi piattaforma")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID sorgente")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((option) =>
          option
            .setName("titolo")
            .setDescription("Titolo da mostrare nella notifica")
            .setRequired(false)
            .setMaxLength(250)
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("URL da mostrare nella notifica")
            .setRequired(false)
            .setMaxLength(500)
        )
    );

  const canale = new SlashCommandBuilder()
    .setName("canale")
    .setDescription("Gestisce i canali Discord di default")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("imposta")
        .setDescription("Imposta il canale default per un tipo")
        .addStringOption(addTypeOption)
        .addChannelOption((option) => addTextChannelOption(option, true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rimuovi")
        .setDescription("Rimuove il canale default per un tipo")
        .addStringOption(addTypeOption)
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("mostra").setDescription("Mostra i canali default")
    );

  const messaggio = new SlashCommandBuilder()
    .setName("messaggio")
    .setDescription("Gestisce i template dei messaggi")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("imposta")
        .setDescription("Imposta un template globale")
        .addStringOption(addTypeOption)
        .addStringOption((option) =>
          option
            .setName("testo")
            .setDescription("Template con placeholder: {creator}, {platform}, {title}, {url}, {mention}")
            .setRequired(true)
            .setMaxLength(1500)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mostra")
        .setDescription("Mostra i template attuali")
        .addStringOption(addOptionalTypeOption)
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Ripristina un template standard")
        .addStringOption(addTypeOption)
    );

  const ruoli = new SlashCommandBuilder()
    .setName("ruoli")
    .setDescription("Gestisce i ruoli autorizzati ai comandi")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("aggiungi")
        .setDescription("Autorizza un ruolo")
        .addRoleOption((option) =>
          option.setName("ruolo").setDescription("Ruolo autorizzato").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rimuovi")
        .setDescription("Rimuove un ruolo autorizzato")
        .addRoleOption((option) =>
          option.setName("ruolo").setDescription("Ruolo da rimuovere").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("lista").setDescription("Mostra i ruoli autorizzati")
    );

  const stato = new SlashCommandBuilder()
    .setName("stato")
    .setDescription("Mostra stato bot e configurazione");

  return [streamer, canale, messaggio, ruoli, stato];
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
    return "Tipo sorgente non valido.";
  }

  if (input.feedUrl) return null;

  if (input.platform === "youtube") {
    try {
      buildFeedUrl(input);
      return null;
    } catch (error) {
      if (process.env.YOUTUBE_API_KEY) return null;
      return `${error.message} Oppure imposta YOUTUBE_API_KEY su Railway.`;
    }
  }

  if (input.platform === "tiktok") {
    return null;
  }

  return `Per video ${platformLabel(input.platform)} serve il campo feed con un RSS/Atom https consentito.`;
}

function findSource(store, id) {
  return store.snapshot().sources.find((source) => source.id === Number(id)) || null;
}

function sourcePreview(store, source) {
  const data = store.snapshot();
  const template = source.customMessage || data.templates[source.type] || DEFAULT_TEMPLATES[source.type];
  const event = {
    title: "Test notification",
    url: source.url || defaultPlatformUrl(source.platform, source.username),
    publishedAt: new Date().toISOString(),
    startedAt: new Date().toISOString()
  };
  return formatMessage(template, source, event);
}

function sourceListText(sources) {
  if (sources.length === 0) return "Nessuna sorgente configurata.";
  const lines = sources.slice(0, 25).map(describeSource);
  if (sources.length > 25) {
    lines.push(`... altre ${sources.length - 25} sorgenti non mostrate.`);
  }
  return lines.join("\n");
}

function sourceModeNote(source) {
  if (!source.manualOnly) return "";
  return "\nQuesta piattaforma live e impostata come manuale: usa /streamer annuncia quando va live.";
}

async function handleStreamer(interaction, store) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "aggiungi") {
    const type = interaction.options.getString("tipo", true);
    const platform = interaction.options.getString("piattaforma", true);
    const username = interaction.options.getString("utente", true).trim();
    const channel = interaction.options.getChannel("canale");
    const displayName = interaction.options.getString("nome")?.trim() || username;
    const url = interaction.options.getString("url")?.trim() || null;
    const feedUrl = interaction.options.getString("feed")?.trim() || null;
    const customMessage = interaction.options.getString("messaggio")?.trim() || null;
    const mentionRole = interaction.options.getRole("ruolo_ping");
    const notifyOnFirstCheck = interaction.options.getBoolean("notifica_subito") === true;
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
        content: "Scegli un canale oppure imposta prima un canale default con /canale imposta.",
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
      content: `Sorgente aggiunta: ${describeSource(source)}${sourceModeNote(source)}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "modifica") {
    const id = interaction.options.getInteger("id", true);
    const source = findSource(store, id);
    if (!source) {
      await interaction.reply({ content: `Sorgente #${id} non trovata.`, ephemeral: true });
      return;
    }

    const patch = {};
    const cursorFields = ["tipo", "piattaforma", "utente", "feed", "url"];

    const type = interaction.options.getString("tipo");
    const platform = interaction.options.getString("piattaforma");
    const username = interaction.options.getString("utente")?.trim();
    const channel = interaction.options.getChannel("canale");
    const displayName = interaction.options.getString("nome")?.trim();
    const url = interaction.options.getString("url")?.trim();
    const feedUrl = interaction.options.getString("feed")?.trim();
    const customMessage = interaction.options.getString("messaggio")?.trim();
    const mentionRole = interaction.options.getRole("ruolo_ping");
    const removePing = interaction.options.getBoolean("rimuovi_ping");
    const enabled = interaction.options.getBoolean("attivo");
    const resetMessage = interaction.options.getBoolean("reset_messaggio");

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
      content: `Sorgente aggiornata: ${describeSource(updated)}${sourceModeNote(updated)}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "rimuovi") {
    const id = interaction.options.getInteger("id", true);
    const removed = await store.removeSource(id);
    await interaction.reply({
      content: removed ? `Sorgente rimossa: ${describeSource(removed)}` : `Sorgente #${id} non trovata.`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "lista") {
    const type = interaction.options.getString("tipo");
    const platform = interaction.options.getString("piattaforma");
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
    const send = interaction.options.getBoolean("invia") === true;
    const source = findSource(store, id);
    if (!source) {
      await interaction.reply({ content: `Sorgente #${id} non trovata.`, ephemeral: true });
      return;
    }

    if (send) {
      await sendTestNotification(interaction.client, store, source);
      await interaction.reply({ content: "Notifica di test inviata.", ephemeral: true });
      return;
    }

    await interaction.reply({
      content: `Preview:\n${sourcePreview(store, source)}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "annuncia") {
    const id = interaction.options.getInteger("id", true);
    const source = findSource(store, id);
    if (!source) {
      await interaction.reply({ content: `Sorgente #${id} non trovata.`, ephemeral: true });
      return;
    }

    const title = interaction.options.getString("titolo")?.trim() || null;
    const url = interaction.options.getString("url")?.trim() || null;
    await sendManualNotification(interaction.client, store, source, { title, url });
    await interaction.reply({ content: "Notifica manuale inviata.", ephemeral: true });
  }
}

async function handleCanale(interaction, store) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "imposta") {
    const type = interaction.options.getString("tipo", true);
    const channel = interaction.options.getChannel("canale", true);
    const channels = await store.setDefaultChannel(type, channel.id);
    await interaction.reply({
      content: `Canale default ${type}: <#${channels[type]}>`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "rimuovi") {
    const type = interaction.options.getString("tipo", true);
    await store.setDefaultChannel(type, null);
    await interaction.reply({
      content: `Canale default ${type} rimosso.`,
      ephemeral: true
    });
    return;
  }

  const channels = store.snapshot().defaultChannels;
  await interaction.reply({
    content: `Live: ${channels.live ? `<#${channels.live}>` : "non impostato"}\nVideo: ${
      channels.video ? `<#${channels.video}>` : "non impostato"
    }`,
    ephemeral: true
  });
}

async function handleMessaggio(interaction, store) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "imposta") {
    const type = interaction.options.getString("tipo", true);
    const text = interaction.options.getString("testo", true);
    await store.setTemplate(type, text);
    await interaction.reply({
      content: `Template ${type} aggiornato.\nPlaceholder: {mention}, {creator}, {username}, {platform}, {type}, {title}, {url}, {channel}, {publishedAt}, {startedAt}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "reset") {
    const type = interaction.options.getString("tipo", true);
    const template = await store.resetTemplate(type);
    await interaction.reply({
      content: `Template ${type} ripristinato:\n${template}`,
      ephemeral: true
    });
    return;
  }

  const type = interaction.options.getString("tipo");
  const templates = store.snapshot().templates;
  const lines = type
    ? [`${type}: ${templates[type]}`]
    : [`live: ${templates.live}`, `video: ${templates.video}`];

  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: true
  });
}

async function handleRuoli(interaction, store) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "aggiungi") {
    const role = interaction.options.getRole("ruolo", true);
    const roles = await store.addAllowedRole(role.id);
    await interaction.reply({
      content: `Ruolo autorizzato: <@&${role.id}>\nTotale ruoli: ${roles.length}`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "rimuovi") {
    const role = interaction.options.getRole("ruolo", true);
    const roles = await store.removeAllowedRole(role.id);
    await interaction.reply({
      content: `Ruolo rimosso: <@&${role.id}>\nTotale ruoli: ${roles.length}`,
      ephemeral: true
    });
    return;
  }

  const roles = store.snapshot().allowedRoleIds;
  await interaction.reply({
    content: roles.length ? roles.map((roleId) => `<@&${roleId}>`).join("\n") : "Nessun ruolo configurato.",
    ephemeral: true
  });
}

async function handleStato(interaction, store) {
  const data = store.snapshot();
  const enabled = data.sources.filter((source) => source.enabled && !source.manualOnly).length;
  const manual = data.sources.filter((source) => source.manualOnly).length;
  const total = data.sources.length;
  const live = data.sources.filter((source) => source.type === "live").length;
  const video = data.sources.filter((source) => source.type === "video").length;

  await interaction.reply({
    content: [
      "Bot Streamers CLT online.",
      `Server: ${data.guildId}`,
      `Sorgenti: ${enabled}/${total} automatiche, ${manual} manuali (${live} live, ${video} video)`,
      `Intervallo controlli: ${data.settings.checkIntervalSeconds}s`,
      `Ruoli autorizzati: ${data.allowedRoleIds.length}`,
      `Canale live: ${data.defaultChannels.live ? `<#${data.defaultChannels.live}>` : "non impostato"}`,
      `Canale video: ${data.defaultChannels.video ? `<#${data.defaultChannels.video}>` : "non impostato"}`,
      `Piattaforme: ${PLATFORMS.map((item) => platformLabel(item.value)).join(", ")}`
    ].join("\n"),
    ephemeral: true
  });
}

async function handleInteraction(interaction, store) {
  if (!interaction.isChatInputCommand()) return;
  if (!(await ensureAuthorized(interaction, store))) return;

  try {
    if (interaction.commandName === "streamer") {
      await handleStreamer(interaction, store);
      return;
    }

    if (interaction.commandName === "canale") {
      await handleCanale(interaction, store);
      return;
    }

    if (interaction.commandName === "messaggio") {
      await handleMessaggio(interaction, store);
      return;
    }

    if (interaction.commandName === "ruoli") {
      await handleRuoli(interaction, store);
      return;
    }

    if (interaction.commandName === "stato") {
      await handleStato(interaction, store);
    }
  } catch (error) {
    const payload = {
      content: `Errore: ${error.message}`,
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