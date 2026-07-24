const path = require("node:path");

const DEFAULT_GUILD_ID = "1505903653079351357";
const DEFAULT_ALLOWED_ROLE_IDS = [
  "1505905849774641243",
  "1519377368354132110",
  "1505906085901504522"
];

const DEFAULT_TEMPLATES = {
  live: "{mention} {creator} este LIVE pe {platform}: {url}",
  video: "{mention} {creator} a publicat un video nou pe {platform}: {title} {url}"
};

function parseCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getGuildId() {
  return process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;
}

function getAllowedRoleIds() {
  const fromEnv = parseCsv(process.env.ALLOWED_ROLE_IDS);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_ROLE_IDS;
}

function getCheckIntervalSeconds() {
  return Math.max(60, parsePositiveInt(process.env.CHECK_INTERVAL_SECONDS, 120));
}

function getDataFilePath() {
  if (process.env.DATA_FILE) {
    return path.resolve(process.env.DATA_FILE);
  }

  const dataDir =
    process.env.DATA_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    path.join(process.cwd(), "data");

  return path.join(path.resolve(dataDir), "bot-streamers-clt.json");
}

module.exports = {
  DEFAULT_ALLOWED_ROLE_IDS,
  DEFAULT_GUILD_ID,
  DEFAULT_TEMPLATES,
  getAllowedRoleIds,
  getCheckIntervalSeconds,
  getDataFilePath,
  getGuildId,
  parseCsv
};
