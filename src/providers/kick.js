function kickUrl(username) {
  return `https://kick.com/${encodeURIComponent(String(username || "").replace(/^@/, ""))}`;
}

async function getKickLive(source) {
  const username = String(source.username || "").replace(/^@/, "");
  if (!username) {
    throw new Error("Username Kick lipsa.");
  }

  const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(username)}`, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 Bot-Streamers-CLT/1.0"
    }
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Eroare Kick: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const live = payload.livestream || payload.channel?.livestream || payload.data?.livestream || null;
  if (!live) return null;

  return {
    id: `kick-live:${live.id || live.slug || live.created_at || username}`,
    type: "live",
    title: live.session_title || live.title || payload.user?.username || source.displayName || "Kick Live",
    url: source.url || kickUrl(username),
    startedAt: live.created_at || live.start_time || live.started_at || null,
    raw: payload
  };
}

module.exports = {
  getKickLive,
  kickUrl
};
