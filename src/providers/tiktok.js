function cleanTikTokUsername(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function tiktokUrl(username) {
  return `https://www.tiktok.com/@${encodeURIComponent(cleanTikTokUsername(username))}/live`;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.tiktok.com/"
};

// Metoda gratuita (fara cheie): endpointul public webcast info_by_user.
// Live inseamna status_code === 0 si data.status === 2 (acelasi criteriu folosit
// de bibliotecile TikTokLive). Orice eroare de transport devine "reincerc",
// ca sa nu marcam live fals cand TikTok blocheaza cererea de pe server.
async function getTikTokLiveFree(source) {
  const username = cleanTikTokUsername(source.username);
  if (!username) {
    throw new Error("Username TikTok lipsa.");
  }

  const url = `https://webcast.tiktok.com/webcast/room/info_by_user/?aid=1988&unique_id=${encodeURIComponent(
    username
  )}`;

  const response = await fetch(url, {
    method: "GET",
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(
      `TikTok Live (fara API): HTTP ${response.status}. TikTok poate limita cererile de pe server; reincerc data urmatoare.`
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("TikTok Live (fara API): raspuns necitibil (posibil blocat). Reincerc data urmatoare.");
  }

  const data = (payload && payload.data) || {};

  if (payload.status_code === 0 && data.status === 2) {
    const roomId = data.id_str || (data.id != null ? String(data.id) : username);
    const startedAt = data.create_time
      ? new Date(Number(data.create_time) * 1000).toISOString()
      : null;

    return {
      id: `tiktok-live:${roomId}`,
      type: "live",
      title: data.title || (data.owner && data.owner.nickname) || source.displayName || "TikTok Live",
      url: source.url || tiktokUrl(username),
      startedAt,
      raw: { status: data.status, roomId }
    };
  }

  return null;
}

function requireTikToolsApiKey() {
  const apiKey = (process.env.TIKTOOL_API_KEY || process.env.TIKTOOLS_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("TIKTOOL_API_KEY este obligatorie pentru live TikTok prin tik.tools.");
  }
  return apiKey;
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

// Metoda cu cheie tik.tools (folosita cand TIKTOOL_API_KEY este setata).
async function getTikTokLiveViaTikTools(source) {
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

async function getTikTokLive(source) {
  const apiKey = (process.env.TIKTOOL_API_KEY || process.env.TIKTOOLS_API_KEY || "").trim();
  if (apiKey) {
    return getTikTokLiveViaTikTools(source);
  }
  return getTikTokLiveFree(source);
}

module.exports = {
  getTikTokLive,
  tiktokUrl
};
