function cleanText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function platformLabel(platform) {
  const labels = {
    twitch: "Twitch",
    youtube: "YouTube",
    tiktok: "TikTok",
    kick: "Kick",
    facebook: "Facebook",
    instagram: "Instagram",
    trovo: "Trovo",
    rumble: "Rumble",
    x: "X/Twitter",
    custom: "Custom",
    rss: "RSS"
  };
  return labels[platform] || platform;
}

function defaultPlatformUrl(platform, username) {
  const clean = String(username || "").replace(/^@/, "");
  const encoded = encodeURIComponent(clean);
  const urls = {
    twitch: `https://www.twitch.tv/${encoded}`,
    youtube: clean.startsWith("UC") ? `https://www.youtube.com/channel/${encoded}` : `https://www.youtube.com/@${encoded}`,
    tiktok: `https://www.tiktok.com/@${encoded}`,
    kick: `https://kick.com/${encoded}`,
    facebook: `https://www.facebook.com/${encoded}`,
    instagram: `https://www.instagram.com/${encoded}`,
    trovo: `https://trovo.live/s/${encoded}`,
    rumble: `https://rumble.com/c/${encoded}`,
    x: `https://x.com/${encoded}`
  };
  return urls[platform] || "";
}

function truncateDiscordMessage(content) {
  if (content.length <= 1900) return content;
  return `${content.slice(0, 1897)}...`;
}

function formatMessage(template, source, event) {
  const mention = source.mentionRoleId ? `<@&${source.mentionRoleId}>` : "";
  const values = {
    mention,
    creator: source.displayName || source.username,
    username: source.username,
    platform: platformLabel(source.platform),
    type: source.type,
    title: event.title || "",
    url: event.url || source.url || defaultPlatformUrl(source.platform, source.username),
    channel: source.channelId ? `<#${source.channelId}>` : "",
    publishedAt: event.publishedAt || "",
    startedAt: event.startedAt || ""
  };

  const content = cleanText(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return match;
    return cleanText(values[key]);
  });

  return truncateDiscordMessage(content.replace(/[ \t]+\n/g, "\n").trim());
}

function describeSource(source) {
  const state = source.manualOnly ? "MANUAL" : source.enabled ? "ON" : "OFF";
  const destination = source.channelId ? `<#${source.channelId}>` : "canal implicit";
  const feed = source.feedUrl ? " | feed" : "";
  const error = source.lastError ? ` | eroare: ${source.lastError}` : "";
  return `#${source.id} [${state}] ${source.type}/${platformLabel(source.platform)} ${source.displayName} -> ${destination}${feed}${error}`;
}

module.exports = {
  defaultPlatformUrl,
  describeSource,
  formatMessage,
  platformLabel
};