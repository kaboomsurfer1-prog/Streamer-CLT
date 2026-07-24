const crypto = require("node:crypto");
const http = require("node:http");
const { URL } = require("node:url");
const { ChannelType } = require("discord.js");
const { getGuildId } = require("./config");
const { describeSource, platformLabel } = require("./messages");
const { checkSourceNow, sendManualNotification, sendTestNotification } = require("./notifications");
const { validatePlatformLink, validateSourceInput } = require("./commands");
const logger = require("./logger");

const SESSION_COOKIE = "clt_dashboard";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const BODY_LIMIT_BYTES = 1024 * 1024;

const PLATFORMS = [
  { value: "twitch", label: "Twitch", autoLive: true },
  { value: "youtube", label: "YouTube", autoLive: true },
  { value: "tiktok", label: "TikTok", autoLive: true },
  { value: "kick", label: "Kick", autoLive: true },
  { value: "facebook", label: "Facebook", autoLive: false },
  { value: "instagram", label: "Instagram", autoLive: false },
  { value: "trovo", label: "Trovo", autoLive: false },
  { value: "rumble", label: "Rumble", autoLive: false },
  { value: "x", label: "X/Twitter", autoLive: false },
  { value: "rss", label: "RSS", autoLive: false }
];

const TAGS = [
  { value: "user", label: "User Discord" },
  { value: "everyone", label: "@everyone" },
  { value: "here", label: "@here" },
  { value: "role", label: "Rol" },
  { value: "none", label: "Fara tag" }
];

const DEFAULT_MESSAGES = {
  live: "{mention} {creator} este LIVE pe {platform}: {url}",
  video: "{mention} {creator} a publicat un video nou pe {platform}: {title} {url}"
};

function getDashboardPassword() {
  return process.env.DASHBOARD_PASSWORD || "";
}

function getSessionSecret() {
  return process.env.DASHBOARD_SECRET || process.env.DISCORD_TOKEN || getDashboardPassword();
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function createSessionCookie() {
  const payload = base64Url(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
  const token = `${payload}.${sign(payload)}`;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000
  )}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function parseCookies(header) {
  const cookies = {};
  String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const index = part.indexOf("=");
      if (index === -1) return;
      cookies[part.slice(0, index)] = part.slice(index + 1);
    });
  return cookies;
}

function isSessionValid(request) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(body);
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function redirect(response, location, cookie = null) {
  const headers = { location };
  if (cookie) headers["set-cookie"] = cookie;
  response.writeHead(303, headers);
  response.end();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > BODY_LIMIT_BYTES) {
        reject(new Error("Payload prea mare."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readJson(request) {
  const raw = await readBody(request);
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function readForm(request) {
  const raw = await readBody(request);
  return Object.fromEntries(new URLSearchParams(raw));
}

function parseSnowflake(value) {
  const match = String(value || "").match(/\d{17,20}/);
  return match ? match[0] : null;
}

function requireChoice(value, allowed, label) {
  const clean = String(value || "").trim();
  if (!allowed.includes(clean)) {
    throw new Error(`${label} invalid.`);
  }
  return clean;
}

function findSource(store, id) {
  return store.snapshot().sources.find((source) => source.id === Number(id)) || null;
}

async function getGuild(client, guildId) {
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

async function resolveDiscordUser(client, guildId, rawValue, displayName) {
  const id = parseSnowflake(rawValue);
  if (!id) {
    throw new Error("User Discord invalid. Foloseste mention sau ID Discord.");
  }

  const fallback = String(displayName || "").trim();
  if (fallback) return { id, displayName: fallback };

  const guild = await getGuild(client, guildId);
  if (guild) {
    const member = await guild.members.fetch(id).catch(() => null);
    if (member) {
      return { id, displayName: member.displayName || member.user.username || id };
    }
  }

  const user = await client.users.fetch(id).catch(() => null);
  return {
    id,
    displayName: user?.globalName || user?.username || `User ${id}`
  };
}

async function getDiscordMeta(client, guildId) {
  const guild = await getGuild(client, guildId);
  if (!guild) {
    return {
      guildName: guildId,
      channels: [],
      roles: []
    };
  }

  const fetchedChannels = await guild.channels.fetch().catch(() => guild.channels.cache);
  const channels = Array.from(fetchedChannels?.values?.() || [])
    .filter((channel) => channel)
    .filter((channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
    .sort((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type === ChannelType.GuildAnnouncement ? "announcement" : "text"
    }));

  const fetchedRoles = await guild.roles.fetch().catch(() => guild.roles.cache);
  const roles = Array.from(fetchedRoles?.values?.() || [])
    .filter((role) => role && role.id !== guild.id && !role.managed)
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .map((role) => ({
      id: role.id,
      name: role.name
    }));

  return {
    guildName: guild.name || guildId,
    channels,
    roles
  };
}

function serializeSource(source) {
  return {
    ...source,
    label: describeSource(source),
    platformLabel: platformLabel(source.platform),
    stateLabel: source.manualOnly ? "MANUAL" : source.enabled ? "AUTO" : "OFF"
  };
}

async function buildState(store, client) {
  const data = store.snapshot();
  const discord = await getDiscordMeta(client, data.guildId || getGuildId());
  const autoSources = data.sources.filter((source) => source.enabled && !source.manualOnly).length;
  const manualSources = data.sources.filter((source) => source.manualOnly).length;

  return {
    ok: true,
    guildId: data.guildId,
    guildName: discord.guildName,
    botUser: client.user ? { id: client.user.id, tag: client.user.tag } : null,
    channels: discord.channels,
    roles: discord.roles,
    platforms: PLATFORMS,
    tags: TAGS,
    defaults: DEFAULT_MESSAGES,
    stats: {
      total: data.sources.length,
      auto: autoSources,
      manual: manualSources,
      live: data.sources.filter((source) => source.type === "live").length,
      video: data.sources.filter((source) => source.type === "video").length
    },
    sources: data.sources.map(serializeSource)
  };
}

async function buildSourceFromPayload(payload, store, client) {
  const type = requireChoice(payload.type, ["live", "video"], "Tip");
  const allowedPlatforms = type === "live"
    ? PLATFORMS.filter((platform) => platform.value !== "rss").map((platform) => platform.value)
    : PLATFORMS.map((platform) => platform.value);
  const platform = requireChoice(payload.platform, allowedPlatforms, "Platforma");
  const mode = requireChoice(payload.mode, ["auto", "manual"], "Mod");
  const tagMode = requireChoice(payload.tagMode, TAGS.map((tag) => tag.value), "Tag");
  const channelId = parseSnowflake(payload.channelId);
  const mentionRoleId = tagMode === "role" ? parseSnowflake(payload.mentionRoleId) : null;
  const link = String(payload.link || "").trim();
  const customMessage = String(payload.customMessage || DEFAULT_MESSAGES[type]).trim();
  const feedUrl = type === "video" ? String(payload.feedUrl || "").trim() || null : null;
  const guildId = store.snapshot().guildId || getGuildId();

  if (!channelId) {
    throw new Error("Canal Discord invalid. Alege canalul unde se trimite mesajul.");
  }

  if (tagMode === "role" && !mentionRoleId) {
    throw new Error("Ai ales tag Rol, deci trebuie sa alegi si rolul.");
  }

  if (!customMessage) {
    throw new Error("Mesajul nu poate fi gol.");
  }

  const discordUser = await resolveDiscordUser(client, guildId, payload.discordUser, payload.displayName);
  const linkData = await validatePlatformLink(platform, link);

  const input = {
    type,
    platform,
    username: linkData.username,
    displayName: discordUser.displayName,
    discordUserId: discordUser.id,
    tagMode,
    channelId,
    mentionRoleId,
    url: linkData.url,
    feedUrl: platform === "rss" ? linkData.url : feedUrl,
    customMessage,
    enabled: mode === "auto",
    manualOnly: mode === "manual",
    cursorReady: false,
    notifyOnFirstCheck: type === "live" && mode === "auto",
    lastEventId: null,
    lastLive: false,
    lastError: null
  };

  const validationError = await validateSourceInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return input;
}

async function saveSource(payload, store, client) {
  const input = await buildSourceFromPayload(payload, store, client);
  const id = Number(payload.id);

  if (id > 0) {
    const existing = findSource(store, id);
    if (!existing) throw new Error(`Sursa #${id} nu a fost gasita.`);
    return store.updateSource(id, input);
  }

  return store.addSource(input);
}

async function runSourceAction(action, source, store, client, payload) {
  if (action === "test") {
    await sendTestNotification(client, store, source);
    return "Notificarea de test a fost trimisa.";
  }

  if (action === "check") {
    const result = await checkSourceNow(client, store, source);
    if (result.error) throw new Error(result.error);
    if (result.notified) return "Live detectat si notificarea a fost trimisa.";
    if (result.live) return "Live detectat, dar notificarea nu a fost trimisa.";
    return source.type === "live"
      ? "Control facut: live nu este detectat acum."
      : "Control facut: continut nou nu este detectat acum.";
  }

  if (action === "manual") {
    await sendManualNotification(client, store, source, {
      title: payload.title || "Live stream",
      url: payload.url || source.url
    });
    return "Notificarea manuala a fost trimisa.";
  }

  if (action === "toggle") {
    if (source.enabled && !source.manualOnly) {
      await store.updateSource(source.id, { enabled: false });
      return "Sursa a fost oprita.";
    }

    const merged = {
      ...source,
      enabled: true,
      manualOnly: false,
      cursorReady: false,
      notifyOnFirstCheck: source.type === "live"
    };
    const validationError = await validateSourceInput(merged);
    if (validationError) throw new Error(validationError);

    await store.updateSource(source.id, {
      enabled: true,
      manualOnly: false,
      cursorReady: false,
      notifyOnFirstCheck: source.type === "live",
      lastError: null
    });
    return "Sursa a fost activata automat.";
  }

  if (action === "delete") {
    await store.removeSource(source.id);
    return "Sursa a fost stearsa.";
  }

  throw new Error("Actiune invalida.");
}

function renderSetupPage() {
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot Streamers CLT</title>
  <style>${CSS}</style>
</head>
<body class="login-body">
  <main class="login-shell">
    <h1>Bot Streamers CLT</h1>
    <p>Dashboard-ul este dezactivat.</p>
    <p>Seteaza variabila <code>DASHBOARD_PASSWORD</code> pe Railway, apoi redeploy.</p>
  </main>
</body>
</html>`;
}

function renderLoginPage(error = "") {
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login - Bot Streamers CLT</title>
  <style>${CSS}</style>
</head>
<body class="login-body">
  <main class="login-shell">
    <h1>Bot Streamers CLT</h1>
    <p>Dashboard notificari live si video.</p>
    ${error ? `<div class="alert">${escapeHtml(error)}</div>` : ""}
    <form method="post" action="/login" class="login-form">
      <label>
        Parola dashboard
        <input name="password" type="password" autocomplete="current-password" required autofocus>
      </label>
      <button type="submit">Intra</button>
    </form>
  </main>
</body>
</html>`;
}

function renderDashboardPage() {
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard - Bot Streamers CLT</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">Bot Streamers CLT</p>
      <h1>Dashboard notificari</h1>
    </div>
    <div class="top-actions">
      <button id="refreshButton" type="button">Refresh</button>
      <form method="post" action="/logout">
        <button type="submit" class="secondary">Logout</button>
      </form>
    </div>
  </header>

  <main class="layout">
    <section class="tool-panel">
      <div class="panel-head">
        <h2 id="formTitle">Adauga live</h2>
        <button id="resetFormButton" type="button" class="secondary small">Nou</button>
      </div>
      <form id="sourceForm" class="source-form">
        <input type="hidden" name="id" id="sourceId">
        <div class="field-row">
          <label>
            Tip
            <select name="type" id="type">
              <option value="live">Live</option>
              <option value="video">Video</option>
            </select>
          </label>
          <label>
            Mod
            <select name="mode" id="mode">
              <option value="auto">Automat</option>
              <option value="manual">Manual</option>
            </select>
          </label>
        </div>
        <label>
          User Discord
          <input name="discordUser" id="discordUser" placeholder="@user sau ID Discord" required>
        </label>
        <label>
          Nume afisat
          <input name="displayName" id="displayName" placeholder="Optional">
        </label>
        <div class="field-row">
          <label>
            Platforma
            <select name="platform" id="platform"></select>
          </label>
          <label>
            Tag
            <select name="tagMode" id="tagMode"></select>
          </label>
        </div>
        <label id="roleWrap">
          Rol ping
          <select name="mentionRoleId" id="mentionRoleId"></select>
        </label>
        <label>
          Link canal
          <input name="link" id="link" type="url" placeholder="https://www.tiktok.com/@nume" required>
        </label>
        <label>
          Canal Discord
          <select name="channelId" id="channelId"></select>
        </label>
        <label id="feedWrap">
          Feed video
          <input name="feedUrl" id="feedUrl" type="url" placeholder="Optional pentru video">
        </label>
        <label>
          Mesaj
          <textarea name="customMessage" id="customMessage" rows="4" required></textarea>
        </label>
        <button id="saveButton" type="submit">Salveaza sursa</button>
      </form>
    </section>

    <section class="list-panel">
      <div class="status-strip">
        <div><span id="guildName">Server</span><small>Guild</small></div>
        <div><span id="totalCount">0</span><small>Surse</small></div>
        <div><span id="autoCount">0</span><small>Auto</small></div>
        <div><span id="manualCount">0</span><small>Manual</small></div>
      </div>
      <div class="list-head">
        <h2>Surse configurate</h2>
        <span id="botStatus" class="pill">Online</span>
      </div>
      <div id="notice" class="notice" hidden></div>
      <div id="sourceList" class="source-list"></div>
    </section>

    <section class="list-panel console-panel">
      <div class="list-head">
        <h2>Live console</h2>
        <div class="console-actions">
          <span id="consoleStatus" class="pill state-auto">Live</span>
          <button id="consolePause" type="button" class="secondary small">Pauza</button>
          <button id="consoleClear" type="button" class="secondary small">Curata</button>
        </div>
      </div>
      <div id="logView" class="log-view"></div>
    </section>
  </main>

  <script>${JS}</script>
</body>
</html>`;
}

async function handleRequest(request, response, store, client) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    const data = store.snapshot();
    sendJson(response, 200, {
      ok: true,
      name: "Bot Streamers CLT",
      dashboard: Boolean(getDashboardPassword()),
      sources: data.sources.length,
      enabledSources: data.sources.filter((source) => source.enabled && !source.manualOnly).length
    });
    return;
  }

  if (!getDashboardPassword()) {
    send(response, 503, renderSetupPage());
    return;
  }

  if (request.method === "GET" && url.pathname === "/login") {
    send(response, 200, renderLoginPage());
    return;
  }

  if (request.method === "POST" && url.pathname === "/login") {
    const body = await readForm(request);
    if (timingSafeEqual(body.password || "", getDashboardPassword())) {
      redirect(response, "/", createSessionCookie());
      return;
    }

    send(response, 401, renderLoginPage("Parola gresita."));
    return;
  }

  if (request.method === "POST" && url.pathname === "/logout") {
    redirect(response, "/login", clearSessionCookie());
    return;
  }

  if (!isSessionValid(request)) {
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 401, { ok: false, error: "Neautorizat." });
      return;
    }
    redirect(response, "/login");
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    send(response, 200, renderDashboardPage());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, await buildState(store, client));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/logs") {
    const after = Number(url.searchParams.get("after")) || 0;
    sendJson(response, 200, { ok: true, logs: logger.getLogs(after) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sources") {
    const payload = await readJson(request);
    const source = await saveSource(payload, store, client);
    sendJson(response, 200, { ok: true, message: "Sursa salvata.", source: serializeSource(source) });
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/sources\/(\d+)\/(test|check|manual|toggle|delete)$/);
  if (request.method === "POST" && actionMatch) {
    const source = findSource(store, actionMatch[1]);
    if (!source) throw new Error(`Sursa #${actionMatch[1]} nu a fost gasita.`);
    const payload = await readJson(request).catch(() => ({}));
    const message = await runSourceAction(actionMatch[2], source, store, client, payload);
    sendJson(response, 200, { ok: true, message });
    return;
  }

  if (url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, { ok: false, error: "not_found" });
}

function startDashboardServer(store, client) {
  const port = process.env.PORT || process.env.DASHBOARD_PORT || 8080;

  const server = http.createServer(async (request, response) => {
    try {
      await handleRequest(request, response, store, client);
    } catch (error) {
      logger.warn(`Dashboard error: ${error.message}`);
      if (!response.headersSent) {
        sendJson(response, 400, { ok: false, error: error.message });
      } else {
        response.end();
      }
    }
  });

  server.listen(Number(port), "0.0.0.0", () => {
    logger.info(`Dashboard pornit pe portul ${port}`);
  });

  return server;
}

const CSS = `
:root {
  color-scheme: light;
  --bg: #f5f7f8;
  --panel: #ffffff;
  --ink: #18201f;
  --muted: #65706d;
  --line: #dbe2df;
  --accent: #16745f;
  --accent-dark: #0f5446;
  --danger: #b42318;
  --warning: #a15c07;
  --soft: #edf7f3;
  --shadow: 0 12px 34px rgba(20, 32, 30, 0.08);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  background: var(--bg);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
a { color: var(--accent-dark); }
.topbar {
  min-height: 88px;
  padding: 18px clamp(18px, 4vw, 42px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #111817;
  color: #fff;
  border-bottom: 4px solid #f0b429;
}
.topbar h1, .topbar p, .list-head h2, .panel-head h2 { margin: 0; }
.topbar h1 { font-size: 24px; line-height: 1.2; font-weight: 750; }
.eyebrow {
  color: #c3d1cd;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0;
  margin-bottom: 4px;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.layout {
  width: min(1440px, 100%);
  margin: 0 auto;
  padding: 24px clamp(14px, 3vw, 32px) 40px;
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 22px;
}
.tool-panel, .list-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.tool-panel { padding: 18px; align-self: start; }
.list-panel { padding: 18px; min-width: 0; }
.console-panel { grid-column: 1 / -1; }
.console-actions { display: flex; align-items: center; gap: 8px; }
.log-view {
  background: #0d1512;
  color: #d7e3de;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
  height: 320px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.log-line { padding: 1px 0; }
.log-info { color: #b9c7c1; }
.log-warn { color: #f2c15b; }
.log-error { color: #ff8377; }
.log-empty { color: #6d7d77; }
.panel-head, .list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
h2 { font-size: 18px; line-height: 1.25; }
.source-form {
  display: grid;
  gap: 13px;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
label {
  display: grid;
  gap: 6px;
  color: #2a3432;
  font-size: 13px;
  font-weight: 700;
}
input, select, textarea {
  width: 100%;
  min-height: 42px;
  border: 1px solid #cdd7d3;
  border-radius: 7px;
  padding: 10px 11px;
  color: var(--ink);
  background: #fbfcfc;
  font: inherit;
  font-weight: 500;
}
textarea { min-height: 104px; resize: vertical; }
input:focus, select:focus, textarea:focus {
  outline: 3px solid rgba(22, 116, 95, 0.18);
  border-color: var(--accent);
}
button {
  min-height: 42px;
  border: 0;
  border-radius: 7px;
  padding: 10px 14px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
button:hover { background: var(--accent-dark); }
button.secondary {
  color: var(--ink);
  background: #e9eeec;
}
button.secondary:hover { background: #dce4e1; }
button.danger { background: var(--danger); }
button.danger:hover { background: #8f1c13; }
button.small {
  min-height: 34px;
  padding: 7px 10px;
  font-size: 13px;
}
button:disabled { cursor: not-allowed; opacity: 0.6; }
.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.status-strip div {
  min-height: 72px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fafbfb;
}
.status-strip span {
  display: block;
  font-size: 20px;
  font-weight: 850;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-strip small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-weight: 700;
}
.pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--accent-dark);
  font-weight: 800;
  font-size: 12px;
}
.notice, .alert {
  margin-bottom: 14px;
  border-radius: 7px;
  border: 1px solid #f1c88d;
  background: #fff8ec;
  color: #5f3805;
  padding: 10px 12px;
  font-weight: 650;
}
.source-list {
  display: grid;
  gap: 12px;
}
.source-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
}
.source-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.source-title {
  margin: 0;
  font-size: 16px;
  font-weight: 850;
}
.source-meta {
  margin: 8px 0 0;
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.source-actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.state-auto { color: var(--accent-dark); background: var(--soft); }
.state-manual { color: var(--warning); background: #fff5e5; }
.state-off { color: var(--danger); background: #fff0ee; }
.error-text {
  color: var(--danger);
  font-weight: 750;
}
.empty {
  border: 1px dashed #b9c5c1;
  border-radius: 8px;
  padding: 24px;
  color: var(--muted);
  text-align: center;
  font-weight: 700;
}
.login-body {
  display: grid;
  place-items: center;
  padding: 20px;
  background: #121817;
}
.login-shell {
  width: min(430px, 100%);
  border-radius: 8px;
  border: 1px solid #2e3a37;
  padding: 28px;
  background: #fff;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.25);
}
.login-shell h1 { margin: 0 0 6px; font-size: 26px; }
.login-shell p { margin: 0 0 18px; color: var(--muted); }
.login-form { display: grid; gap: 14px; }
.hidden { display: none !important; }
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .topbar { align-items: flex-start; flex-direction: column; }
  .status-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .field-row { grid-template-columns: 1fr; }
  .status-strip { grid-template-columns: 1fr; }
  .source-main { display: grid; }
  .source-actions button { width: 100%; }
}
`;

const JS = `
(() => {
  const form = document.getElementById("sourceForm");
  const notice = document.getElementById("notice");
  const sourceList = document.getElementById("sourceList");
  const typeInput = document.getElementById("type");
  const platformInput = document.getElementById("platform");
  const tagInput = document.getElementById("tagMode");
  const roleInput = document.getElementById("mentionRoleId");
  const channelInput = document.getElementById("channelId");
  const feedWrap = document.getElementById("feedWrap");
  const roleWrap = document.getElementById("roleWrap");
  const customMessage = document.getElementById("customMessage");
  const sourceId = document.getElementById("sourceId");
  const formTitle = document.getElementById("formTitle");
  let state = null;

  function text(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function api(path, options) {
    const response = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...options
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Eroare dashboard.");
    }
    return payload;
  }

  function showNotice(message, isError) {
    notice.hidden = false;
    notice.textContent = message;
    notice.style.borderColor = isError ? "#f0a39b" : "#9bd2c2";
    notice.style.background = isError ? "#fff0ee" : "#edf7f3";
    notice.style.color = isError ? "#8f1c13" : "#0f5446";
  }

  function fillSelect(select, items, placeholder) {
    select.innerHTML = "";
    if (placeholder) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      select.appendChild(option);
    }
    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id || item.value;
      option.textContent = item.name || item.label;
      select.appendChild(option);
    });
  }

  function selectedTypeDefaultMessage() {
    return state && state.defaults ? state.defaults[typeInput.value] : "";
  }

  function updatePlatformChoices() {
    const platforms = (state ? state.platforms : []).filter((platform) => {
      return typeInput.value === "video" || platform.value !== "rss";
    });
    fillSelect(platformInput, platforms.map((platform) => ({
      value: platform.value,
      label: platform.label + (platform.autoLive ? " - auto live" : "")
    })));
  }

  function updateConditionalFields() {
    feedWrap.classList.toggle("hidden", typeInput.value !== "video");
    roleWrap.classList.toggle("hidden", tagInput.value !== "role");
  }

  function resetForm() {
    form.reset();
    sourceId.value = "";
    formTitle.textContent = "Adauga live";
    typeInput.value = "live";
    updatePlatformChoices();
    tagInput.value = "user";
    customMessage.value = selectedTypeDefaultMessage();
    updateConditionalFields();
  }

  function channelName(id) {
    const channel = state.channels.find((item) => item.id === id);
    return channel ? "#" + channel.name : id;
  }

  function sourceCard(source) {
    const stateClass = source.stateLabel === "AUTO" ? "state-auto" : source.stateLabel === "MANUAL" ? "state-manual" : "state-off";
    const error = source.lastError ? '<span class="error-text">Ultima eroare: ' + text(source.lastError) + '</span>' : "";
    const checked = source.lastCheckedAt ? text(source.lastCheckedAt) : "niciodata";
    const notified = source.lastNotifiedAt ? text(source.lastNotifiedAt) : "niciodata";
    return '<article class="source-card">' +
      '<div class="source-main">' +
        '<div>' +
          '<p class="source-title">#' + source.id + ' ' + text(source.displayName) + '</p>' +
          '<div class="source-meta">' +
            '<span>' + text(source.type.toUpperCase()) + ' / ' + text(source.platformLabel) + ' / <span class="pill ' + stateClass + '">' + text(source.stateLabel) + '</span></span>' +
            '<span>User: &lt;@' + text(source.discordUserId || "") + '&gt;</span>' +
            '<span>Canal Discord: ' + text(channelName(source.channelId)) + '</span>' +
            '<span>Link canal: <a href="' + text(source.url || "#") + '" target="_blank" rel="noreferrer">' + text(source.url || "") + '</a></span>' +
            '<span>Ultim control: ' + checked + ' | Ultima notificare: ' + notified + '</span>' +
            error +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="source-actions">' +
        '<button class="small" data-action="test" data-id="' + source.id + '">Test</button>' +
        '<button class="small" data-action="check" data-id="' + source.id + '">Verifica ora</button>' +
        '<button class="small" data-action="manual" data-id="' + source.id + '">Anunta</button>' +
        '<button class="small secondary" data-action="edit" data-id="' + source.id + '">Modifica</button>' +
        '<button class="small secondary" data-action="toggle" data-id="' + source.id + '">' + (source.enabled && !source.manualOnly ? "Opreste" : "Auto") + '</button>' +
        '<button class="small danger" data-action="delete" data-id="' + source.id + '">Sterge</button>' +
      '</div>' +
    '</article>';
  }

  function render() {
    document.getElementById("guildName").textContent = state.guildName || state.guildId;
    document.getElementById("totalCount").textContent = state.stats.total;
    document.getElementById("autoCount").textContent = state.stats.auto;
    document.getElementById("manualCount").textContent = state.stats.manual;
    document.getElementById("botStatus").textContent = state.botUser ? state.botUser.tag : "Bot";
    fillSelect(channelInput, state.channels.map((channel) => ({ id: channel.id, name: "#" + channel.name })), "Alege canal");
    fillSelect(roleInput, state.roles.map((role) => ({ id: role.id, name: "@" + role.name })), "Alege rol");
    fillSelect(tagInput, state.tags);
    updatePlatformChoices();
    updateConditionalFields();

    if (!sourceList) return;
    sourceList.innerHTML = state.sources.length
      ? state.sources.map(sourceCard).join("")
      : '<div class="empty">Nu exista surse configurate.</div>';
  }

  async function loadState() {
    state = await api("/api/state");
    render();
    if (!customMessage.value) customMessage.value = selectedTypeDefaultMessage();
  }

  function getSource(id) {
    return state.sources.find((source) => String(source.id) === String(id));
  }

  function editSource(source) {
    sourceId.value = source.id;
    formTitle.textContent = "Modifica sursa #" + source.id;
    typeInput.value = source.type;
    updatePlatformChoices();
    platformInput.value = source.platform;
    document.getElementById("mode").value = source.manualOnly ? "manual" : "auto";
    document.getElementById("discordUser").value = source.discordUserId || "";
    document.getElementById("displayName").value = source.displayName || "";
    document.getElementById("link").value = source.url || "";
    channelInput.value = source.channelId || "";
    tagInput.value = source.tagMode || "user";
    roleInput.value = source.mentionRoleId || "";
    document.getElementById("feedUrl").value = source.feedUrl || "";
    customMessage.value = source.customMessage || selectedTypeDefaultMessage();
    updateConditionalFields();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await api("/api/sources", {
        method: "POST",
        body: JSON.stringify(data)
      });
      showNotice("Sursa a fost salvata.", false);
      await loadState();
      resetForm();
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  sourceList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    const source = getSource(id);
    if (!source) return;

    if (action === "edit") {
      editSource(source);
      return;
    }

    if (action === "delete" && !confirm("Stergi sursa #" + id + "?")) return;

    try {
      const payload = action === "manual" ? { url: source.url, title: "Live stream" } : {};
      const result = await api("/api/sources/" + id + "/" + action, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showNotice(result.message || "Actiune finalizata.", false);
      await loadState();
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  typeInput.addEventListener("change", () => {
    updatePlatformChoices();
    customMessage.value = selectedTypeDefaultMessage();
    formTitle.textContent = sourceId.value ? "Modifica sursa #" + sourceId.value : "Adauga " + typeInput.value;
    updateConditionalFields();
  });
  tagInput.addEventListener("change", updateConditionalFields);
  document.getElementById("refreshButton").addEventListener("click", loadState);
  document.getElementById("resetFormButton").addEventListener("click", resetForm);

  const logView = document.getElementById("logView");
  const consolePause = document.getElementById("consolePause");
  const consoleClear = document.getElementById("consoleClear");
  const consoleStatus = document.getElementById("consoleStatus");
  let lastLogSeq = 0;
  let consolePaused = false;
  const MAX_LOG_LINES = 600;

  function appendLogs(logs) {
    if (!logs || !logs.length) return;
    const atBottom = logView.scrollHeight - logView.scrollTop - logView.clientHeight < 60;
    const empty = logView.querySelector(".log-empty");
    if (empty) empty.remove();
    logs.forEach((entry) => {
      if (entry.seq > lastLogSeq) lastLogSeq = entry.seq;
      const line = document.createElement("div");
      line.className = "log-line log-" + String(entry.level || "info").toLowerCase();
      line.textContent = "[" + entry.ts + "] " + entry.level + " " + entry.message;
      logView.appendChild(line);
    });
    while (logView.childElementCount > MAX_LOG_LINES) {
      logView.removeChild(logView.firstChild);
    }
    if (atBottom) logView.scrollTop = logView.scrollHeight;
  }

  async function pollLogs() {
    if (consolePaused) return;
    try {
      const payload = await api("/api/logs?after=" + lastLogSeq);
      appendLogs(payload.logs);
    } catch (error) {
      /* pastram polling-ul chiar daca o cerere esueaza */
    }
  }

  if (logView) {
    logView.innerHTML = '<div class="log-empty">Astept loguri de la bot...</div>';
    consolePause.addEventListener("click", () => {
      consolePaused = !consolePaused;
      consolePause.textContent = consolePaused ? "Reia" : "Pauza";
      consoleStatus.textContent = consolePaused ? "Pauza" : "Live";
      consoleStatus.classList.toggle("state-auto", !consolePaused);
      consoleStatus.classList.toggle("state-off", consolePaused);
    });
    consoleClear.addEventListener("click", () => {
      logView.innerHTML = "";
    });
    pollLogs();
    setInterval(pollLogs, 3000);
  }

  loadState().catch((error) => showNotice(error.message, true));
})();
`;

module.exports = {
  startDashboardServer
};
