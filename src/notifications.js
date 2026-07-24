const { ChannelType } = require("discord.js");
const { nowIso } = require("./storage");
const { defaultPlatformUrl, formatMessage } = require("./messages");
const { getLatestRssItem } = require("./providers/rss");
const { getKickLive } = require("./providers/kick");
const { getTwitchLive } = require("./providers/twitch");
const { getLatestYouTubeVideo, getYouTubeLive } = require("./providers/youtube");
const logger = require("./logger");

const LIVE_NATIVE_PLATFORMS = new Set(["twitch", "youtube", "kick"]);

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

  if (source.type === "live" && source.platform === "kick") {
    return getKickLive(source);
  }

  if (source.type === "video") {
    return getLatestVideoEvent(source);
  }

  throw new Error(`Sorgente non supportata: ${source.type}/${source.platform}`);
}

async function fetchTextChannel(client, channelId) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Canale Discord non valido: ${channelId}`);
  }

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement &&
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread
  ) {
    throw new Error(`Tipo canale non supportato: ${channelId}`);
  }

  return channel;
}

async function sendNotification(client, data, source, event) {
  const channelId = getTargetChannelId(data, source);
  if (!channelId) {
    throw new Error(`Nessun canale configurato per la sorgente #${source.id}.`);
  }

  const channel = await fetchTextChannel(client, channelId);
  const template = source.customMessage || data.templates[source.type];
  const content = formatMessage(template, { ...source, channelId }, event);
  const roles = source.mentionRoleId ? [source.mentionRoleId] : [];

  await channel.send({
    content,
    allowedMentions: {
      roles,
      users: [],
      parse: []
    }
  });
}

function shouldNotify(source, event) {
  if (!event) return false;
  if (!source.cursorReady) return source.notifyOnFirstCheck === true;
  if (source.type === "live" && source.lastLive !== true) return true;
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

async function checkSource(client, store, source) {
  if (!source.enabled || source.manualOnly) return;
  if (!sourceSupportsCheck(source)) {
    await updateSourceAfterCheck(
      store,
      source,
      null,
      false,
      `Sorgente non supportata: ${source.type}/${source.platform}`
    );
    return;
  }

  try {
    const event = await getLatestEvent(source);
    const data = store.snapshot();
    const notify = shouldNotify(source, event);

    if (notify) {
      await sendNotification(client, data, source, event);
      logger.info(`Notifica inviata per sorgente #${source.id}`);
    }

    await updateSourceAfterCheck(store, source, event, notify);
  } catch (error) {
    logger.warn(`Controllo fallito per sorgente #${source.id}: ${error.message}`);
    await updateSourceAfterCheck(store, source, null, false, error.message);
  }
}

async function checkAllSources(client, store) {
  const data = store.snapshot();
  for (const source of data.sources) {
    await checkSource(client, store, source);
  }
}

function startNotificationLoop(client, store) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      await checkAllSources(client, store);
    } finally {
      running = false;
    }
  }

  const intervalSeconds = store.snapshot().settings.checkIntervalSeconds;
  const interval = Math.max(60, Number(intervalSeconds) || 120) * 1000;
  setInterval(tick, interval);
  setTimeout(tick, 5000);
  logger.info(`Watcher notifiche avviato ogni ${interval / 1000}s`);
}

async function sendTestNotification(client, store, source) {
  const data = store.snapshot();
  const event = {
    id: `test:${Date.now()}`,
    type: source.type,
    title: "Test notification",
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
    title: input.title || (source.type === "live" ? "Live stream" : "Nuovo contenuto"),
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
  getLatestEvent,
  sendManualNotification,
  sendTestNotification,
  sourceSupportsCheck,
  startNotificationLoop
};