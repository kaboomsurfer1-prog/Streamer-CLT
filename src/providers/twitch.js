let cachedToken = null;
let tokenExpiresAt = 0;

function requireTwitchCredentials() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("TWITCH_CLIENT_ID si TWITCH_CLIENT_SECRET sunt obligatorii pentru Twitch.");
  }

  return { clientId, clientSecret };
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const { clientId, clientSecret } = requireTwitchCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials"
  });

  const response = await fetch(`https://id.twitch.tv/oauth2/token?${params.toString()}`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Eroare token Twitch: HTTP ${response.status}`);
  }

  const payload = await response.json();
  cachedToken = payload.access_token;
  tokenExpiresAt = now + Number(payload.expires_in || 3600) * 1000;
  return cachedToken;
}

async function getTwitchLive(source) {
  const { clientId } = requireTwitchCredentials();
  const token = await getAccessToken();
  const username = String(source.username || "").replace(/^@/, "");
  const params = new URLSearchParams({ user_login: username });

  const response = await fetch(`https://api.twitch.tv/helix/streams?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId
    }
  });

  if (!response.ok) {
    throw new Error(`Eroare Twitch streams: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const stream = Array.isArray(payload.data) ? payload.data[0] : null;
  if (!stream) return null;

  return {
    id: stream.id,
    type: "live",
    title: stream.title || "Live stream",
    url: source.url || `https://www.twitch.tv/${encodeURIComponent(username)}`,
    startedAt: stream.started_at || null,
    raw: stream
  };
}

module.exports = {
  getTwitchLive
};
