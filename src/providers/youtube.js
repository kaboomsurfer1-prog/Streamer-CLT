const channelCache = new Map();

function requireYouTubeApiKey() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY este obligatorie pentru YouTube Live sau handle YouTube.");
  }
  return apiKey;
}

function extractYouTubeChannelId(value) {
  const text = String(value || "").trim();
  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(text)) return text;

  const match = text.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
}

function extractYouTubeHandle(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.startsWith("@")) return text;

  const match = text.match(/youtube\.com\/@([^/?#]+)/i);
  if (match) return `@${match[1]}`;

  if (!text.includes("/") && !text.includes(".") && !text.startsWith("UC")) {
    return `@${text.replace(/^@/, "")}`;
  }

  return null;
}

async function youtubeGet(path, params) {
  const apiKey = requireYouTubeApiKey();
  const query = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Bot-Streamers-CLT/1.0"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Eroare YouTube API ${path}: HTTP ${response.status}`);
  }

  return response.json();
}

async function resolveYouTubeChannelId(source) {
  const directId = extractYouTubeChannelId(source.username) || extractYouTubeChannelId(source.url);
  if (directId) return directId;

  const cacheKey = `${source.username || ""}|${source.url || ""}`;
  if (channelCache.has(cacheKey)) return channelCache.get(cacheKey);

  const handle = extractYouTubeHandle(source.username) || extractYouTubeHandle(source.url);
  const attempts = [];

  if (handle) attempts.push({ forHandle: handle });
  if (source.username && !String(source.username).startsWith("@")) {
    attempts.push({ forUsername: source.username });
  }

  for (const params of attempts) {
    const payload = await youtubeGet("channels", {
      part: "snippet",
      maxResults: "1",
      ...params
    });
    const channel = Array.isArray(payload.items) ? payload.items[0] : null;
    if (channel?.id) {
      channelCache.set(cacheKey, channel.id);
      return channel.id;
    }
  }

  throw new Error("Canal YouTube negasit. Foloseste un channel id UC... sau un handle valid.");
}

async function getYouTubeLive(source) {
  const channelId = await resolveYouTubeChannelId(source);
  const payload = await youtubeGet("search", {
    part: "snippet",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: "1"
  });

  const item = Array.isArray(payload.items) ? payload.items[0] : null;
  const videoId = item?.id?.videoId;
  if (!videoId) return null;

  return {
    id: `youtube-live:${videoId}`,
    type: "live",
    title: item.snippet?.title || "YouTube Live",
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    startedAt: item.snippet?.publishedAt || null,
    raw: item
  };
}

async function getLatestYouTubeVideo(source) {
  const channelId = await resolveYouTubeChannelId(source);
  const payload = await youtubeGet("search", {
    part: "snippet",
    channelId,
    type: "video",
    order: "date",
    maxResults: "1"
  });

  const item = Array.isArray(payload.items) ? payload.items[0] : null;
  const videoId = item?.id?.videoId;
  if (!videoId) return null;

  return {
    id: `youtube-video:${videoId}`,
    type: "video",
    title: item.snippet?.title || "Video YouTube nou",
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    publishedAt: item.snippet?.publishedAt || null,
    raw: item
  };
}

module.exports = {
  extractYouTubeChannelId,
  getLatestYouTubeVideo,
  getYouTubeLive,
  resolveYouTubeChannelId
};
