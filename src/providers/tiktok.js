function requireTikToolsApiKey() {
  const apiKey = process.env.TIKTOOL_API_KEY || process.env.TIKTOOLS_API_KEY;
  if (!apiKey) {
    throw new Error("TIKTOOL_API_KEY este obligatorie pentru live TikTok automat.");
  }
  return apiKey;
}

function cleanTikTokUsername(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function tiktokUrl(username) {
  return `https://www.tiktok.com/@${encodeURIComponent(cleanTikTokUsername(username))}/live`;
}

function pickLiveRow(payload) {
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  if (Array.isArray(payload?.data?.results)) return payload.data.results[0] || null;
  if (payload?.data && typeof payload.data === "object") return payload.data;
  return payload || null;
}

function isLive(row) {
  if (!row) return false;
  if (row.alive === null || row.is_live === null || row.check_failed === true) {
    throw new Error("TikTok Live are status necunoscut momentan. Reincerc la urmatoarea verificare.");
  }

  return (
    row.alive === true ||
    row.is_live === true ||
    row.live === true ||
    row.alive_status === "live" ||
    row.live_status === "live"
  );
}

async function parseTikToolsResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("TikTools a refuzat cheia API (HTTP 403). Verifica TIKTOOL_API_KEY, planul si quota pe tik.tools/dashboard.");
  }

  if (response.status === 429) {
    throw new Error("TikTools quota/rate limit atins. Verifica planul sau asteapta resetarea limitei.");
  }

  if (!response.ok) {
    throw new Error(`Eroare TikTools TikTok Live: HTTP ${response.status}`);
  }

  if (payload?.status_code && payload.status_code !== 0) {
    throw new Error(`Eroare TikTools: ${payload.message || payload.status_msg || payload.status_code}`);
  }

  return payload;
}

async function getTikTokLive(source) {
  const apiKey = requireTikToolsApiKey();
  const username = cleanTikTokUsername(source.username);
  if (!username) {
    throw new Error("Username TikTok lipsa.");
  }

  const query = new URLSearchParams({
    apiKey,
    unique_id: username
  });

  const response = await fetch(`https://api.tik.tools/webcast/check_alive?${query.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Bot-Streamers-CLT/1.0",
      "x-api-key": apiKey
    },
    signal: AbortSignal.timeout(15000)
  });

  const payload = await parseTikToolsResponse(response);
  const row = pickLiveRow(payload);
  if (!isLive(row)) return null;

  const roomId = row.room_id || row.roomId || row.live_id || row.liveId || username;

  return {
    id: `tiktok-live:${roomId}`,
    type: "live",
    title: row.title || row.live_title || source.displayName || "TikTok Live",
    url: source.url || row.url || tiktokUrl(username),
    startedAt: row.start_time || row.started_at || row.create_time || null,
    raw: row
  };
}

module.exports = {
  getTikTokLive,
  tiktokUrl
};