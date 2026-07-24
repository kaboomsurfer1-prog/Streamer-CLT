const Parser = require("rss-parser");
const { fetchSafeText } = require("../urlSafety");
const { extractYouTubeChannelId } = require("./youtube");

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Bot-Streamers-CLT/1.0"
  }
});

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function cleanUsername(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function getRssHubBaseUrl() {
  return normalizeBaseUrl(process.env.RSSHUB_URL || "https://rsshub.app");
}

function buildFeedUrl(source) {
  if (source.feedUrl) return source.feedUrl;

  if (source.platform === "youtube") {
    const channelId = extractYouTubeChannelId(source.username) || extractYouTubeChannelId(source.url);
    if (!channelId) {
      throw new Error("Per video YouTube senza API key serve un channel id UC... oppure un feed RSS.");
    }
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  }

  if (source.platform === "tiktok") {
    return `${getRssHubBaseUrl()}/tiktok/user/${encodeURIComponent(cleanUsername(source.username))}`;
  }

  throw new Error(`Per i video ${source.platform} serve un feed RSS valido.`);
}

function itemId(item) {
  return (
    item.guid ||
    item.id ||
    item.link ||
    `${item.title || "untitled"}:${item.isoDate || item.pubDate || ""}`
  );
}

async function getLatestRssItem(source) {
  const feedUrl = buildFeedUrl(source);
  const xml = await fetchSafeText(feedUrl, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "Bot-Streamers-CLT/1.0"
    }
  });
  const feed = await parser.parseString(xml);
  const item = Array.isArray(feed.items) ? feed.items[0] : null;
  if (!item) return null;

  return {
    id: itemId(item),
    type: "video",
    title: item.title || feed.title || "Nuovo contenuto",
    url: item.link || source.url || feed.link || "",
    publishedAt: item.isoDate || item.pubDate || null,
    raw: {
      feedTitle: feed.title || null,
      feedUrl
    }
  };
}

module.exports = {
  buildFeedUrl,
  getLatestRssItem
};