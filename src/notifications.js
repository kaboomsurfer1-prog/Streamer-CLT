const { ChannelType } = require("discord.js");
const { nowIso } = require("./storage");
const { defaultPlatformUrl, formatMessage } = require("./messages");
const { getLatestRssItem } = require("./providers/rss");
const { getKickLive } = require("./providers/kick");
const { getTwitchLive } = require("./providers/twitch");
const { getTikTokLive } = require("./providers/tiktok");
const { getLatestYouTubeVideo, getYouTubeLive } = require("./providers/youtube");
const logger = require("./logger");

const LIVE_NATIVE_PLATFORMS = new Set(["twitch", "youtube", "kick", "tiktok"]);

function getTargetChannelId(data, source) {
  return source.channelId || data.defaultChannels[source.type] || null;
}

function sourceSupportsCheck(source) {
  if (source.type === "live") return LIVE_NATIVE_PLATFORMS.has(source.platform);
  if (source.type === "video") return true;
  return false;
}

async function getLatestVideoEvent(source) {
  if (source.platform === "youtube" && !source.feedUrl && process.env.YOUTUBE_API_KEY) {
    try {
      return await getLatestRssItem(source);
    } catch {
      return getLatestYouTubeVideo(source);
    }
  }

  return getLatestRssItem(source);
}

async function getLatestEvent(source) {
  if (source.type === "live" && source.platform === "twitch") {
    return getTwitchLive(source);
  }

  if (source.type === "live" && source.platform === "youtube") {
    return getYouTubeLive(source);
  }

  if (source.type === "live" && source.platform === "tiktok") {
    return getTikTokLive(source);
  }

  if (source.type === "live" && source.platform === "kick") {
    return getKickLive(source);
  }

  if (source.type === "video") {
    return getLatestVideoEvent(source);
  }

  throw new Error(`Sursa nesuportata: ${source.type}/${source.platform}`);
}

async function fetchTextChannel(client, channelId) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Canal Discord invalid: ${channelId}`);
  }

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement &&
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread
  ) {
    throw new Error(`Tip de canal nesuportat: ${channelId}`);
  }

  return channel;
}

function buildAllowedMentions(source) {
  const roles = [];
  const users = [];
  const parse = [];

  if (source.tagMode === "everyone" || source.tagMode === "here") {
    parse.push("everyone");
  }

  if (source.tagMode === "role" && source.mentionRoleId) {
    roles.push(source.mentionRoleId);
  }

  if (source.tagMode === "user" && source.discordUserId) {
    users.push(source.discordUserId);
  }

  return { roles, users, parse };
}

async function sendNotification(client, data, source, event) {
  const channelId = getTargetChannelId(data, source);
  if (!channelId) {
    throw new Error(`Nu exista canal configurat pentru sursa #${source.id}.`);
  }

  const channel = await fetchTextChannel(client, channelId);
  const template = source.customMessage || data.templates[source.type];
  const content = formatMessage(template, { ...source, channelId }, event);

  await channel.send({
    content,
    allowedMentions: buildAllowedMentions(source)
  });
}

function shouldNotify(source, event) {
  if (!event) return false;

  if (source.type === "live") {
    if (!source.cursorReady) return source.notifyOnFirstCheck === true || source.lastLive !== true;
    if (source.lastLive !== true) return true;
    if (!source.lastNotifiedAt) return true;
    return event.id !== source.lastEventId;
  }

  if (!source.cursorReady) return source.notifyOnFirstCheck === true;
  return event.id !== source.lastEventId;
}

async function updateSourceAfterCheck(store, source, event, notified, errorMessage = null) {
  const patch = {
    lastCheckedAt: nowIso(),
    lastError: errorMessage
  };

  if (errorMessage) {
    await store.updateSource(source.id, patch);
    return;
  }

  if (source.type === "live") {
    patch.lastLive = Boolean(event);
  }

  if (event) {
    patch.cursorReady = true;
    patch.notifyOnFirstCheck = false;
    patch.lastEventId = event.id;
  } else if (!source.cursorReady) {
    patch.cursorReady = true;
    patch.notifyOnFirstCheck = false;
  }

  if (notified) {
    patch.lastNotifiedAt = nowIso();
  }

  await store.updateSource(source.id, patch);
}

async function checkSource(client, store, source, options = {}) {
  if (!source.enabled || source.manualOnly) {
    return { checked: false, notified: false, live: false, message: "Sursa este oprita sau manuala." };
  }

  if (!sourceSupportsCheck(source)) {
    const errorMessage = `Sursa nesuportata: ${source.type}/${source.platform}`;
    await updateSourceAfterCheck(store, source, null, false, errorMessage);
    return { checked: true, notified: false, live: false, error: errorMessage };
  }

  try {
    const event = await getLatestEvent(source);
    const data = store.snapshot();
    const notify = options.forceNotify === true ? Boolean(event) : shouldNotify(source, event);

    if (notify) {
      await sendNotification(client, data, source, event);
      logger.info(`Notificare trimisa pentru sursa #${source.id}`);
    }

    await updateSourceAfterCheck(store, source, event, notify);
    return {
      checked: true,
      notified: notify,
      live: Boolean(event),
      eventId: event?.id || null,
      title: event?.title || null,
      url: event?.url || null
    };
  } catch (error) {
    logger.warn(`Verificare esuata pentru sursa #${source.id}: ${error.message}`);
    await updateSourceAfterCheck(store, source, null, false, error.message);
    return { checked: true, notified: false, live: false, error: error.message };
  }
}

async function checkSourceNow(client, store, source) {
  const checkableSource = {
    ...source,
    enabled: true,
    manualOnly: false,
    notifyOnFirstCheck: true
  };
  return checkSource(client, store, checkableSource, { forceNotify: true });
}

async function checkAllSources(client, store) {
  const data = store.snapshot();
  const summary = {
    total: data.sources.length,
    checked: 0,
    skipped: 0,
    live: 0,
    notified: 0,
    errors: 0
  };

  for (const source of data.sources) {
    const result = await checkSource(client, store, source);
    if (result.checked) summary.checked += 1;
    else summary.skipped += 1;
    if (result.live) summary.live += 1;
    if (result.notified) summary.notified += 1;
    if (result.error) summary.errors += 1;
  }

  return summary;
}

function startNotificationLoop(client, store) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const summary = await checkAllSources(client, store);
      logger.info(
        `Ciclu verificare: ${summary.checked}/${summary.total} verificate, ${summary.live} live, ` +
          `${summary.notified} notificari, ${summary.errors} erori, ${summary.skipped} sarite (manual/oprite)`
      );
    } catch (error) {
      logger.error("Eroare in ciclul de verificare notificari", error);
    } finally {
      running = false;
    }
  }

  const data = store.snapshot();
  const autoCount = data.sources.filter((source) => source.enabled && !source.manualOnly).length;
  const manualCount = data.sources.filter((source) => source.manualOnly).length;
  const offCount = data.sources.filter((source) => !source.enabled && !source.manualOnly).length;
  logger.info(
    `Surse configurate: ${data.sources.length} total | ${autoCount} auto | ${manualCount} manual | ${offCount} oprite`
  );
  if (data.sources.length > 0 && autoCount === 0) {
    logger.warn(
      "Nicio sursa in mod AUTO: notificarile automate NU vor porni. Pune sursele pe Auto din dashboard sau cu comanda de editare."
    );
  }

  const intervalSeconds = data.settings.checkIntervalSeconds;
  const interval = Math.max(60, Number(intervalSeconds) || 120) * 1000;
  setInterval(tick, interval);
  setTimeout(tick, 5000);
  logger.info(`Watcher notificari pornit la fiecare ${interval / 1000}s`);
}

async function sendTestNotification(client, store, source) {
  const data = store.snapshot();
  const event = {
    id: `test:${Date.now()}`,
    type: source.type,
    title: "Notificare de test",
    url: source.url || defaultPlatformUrl(source.platform, source.username),
    publishedAt: nowIso(),
    startedAt: nowIso()
  };
  await sendNotification(client, data, source, event);
}

async function sendManualNotification(client, store, source, input = {}) {
  const data = store.snapshot();
  const event = {
    id: `manual:${Date.now()}`,
    type: source.type,
    title: input.title || (source.type === "live" ? "Live stream" : "Continut nou"),
    url: input.url || source.url || defaultPlatformUrl(source.platform, source.username),
    publishedAt: nowIso(),
    startedAt: nowIso()
  };

  await sendNotification(client, data, source, event);
  await store.updateSource(source.id, {
    lastNotifiedAt: nowIso(),
    lastEventId: event.id,
    cursorReady: true,
    notifyOnFirstCheck: false
  });
}

module.exports = {
  checkAllSources,
  checkSourceNow,
  getLatestEvent,
  sendManualNotification,
  sendTestNotification,
  sourceSupportsCheck,
  startNotificationLoop
};