const dns = require("node:dns/promises");
const net = require("node:net");

const STATIC_ALLOWED_HOSTS = new Set([
  "rsshub.app",
  "rss.app",
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
  "www.tiktok.com",
  "tiktok.com",
  "www.facebook.com",
  "facebook.com",
  "www.instagram.com",
  "instagram.com",
  "kick.com",
  "www.kick.com",
  "trovo.live",
  "www.trovo.live",
  "rumble.com",
  "www.rumble.com",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com"
]);

function configuredAllowedHosts() {
  const hosts = [];
  for (const envName of ["RSSHUB_URL"]) {
    const value = process.env[envName];
    if (!value) continue;
    try {
      hosts.push(new URL(value).hostname.toLowerCase());
    } catch {
      // Invalid env URLs are reported by provider code when used.
    }
  }
  return hosts;
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(address) {
  const lower = address.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:")
  );
}

function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function isAllowedHostname(hostname) {
  const lower = hostname.toLowerCase();
  const allowed = new Set([...STATIC_ALLOWED_HOSTS, ...configuredAllowedHosts()]);
  if (allowed.has(lower)) return true;
  return [...allowed].some((host) => lower.endsWith(`.${host}`));
}

async function assertSafeExternalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL non valido.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Sono permessi solo URL https.");
  }

  if (!isAllowedHostname(url.hostname)) {
    throw new Error(`Dominio non consentito per feed: ${url.hostname}`);
  }

  const literalIpVersion = net.isIP(url.hostname);
  if (literalIpVersion && isPrivateIp(url.hostname)) {
    throw new Error("URL verso IP privati o locali non permesso.");
  }

  const records = await dns.lookup(url.hostname, { all: true });
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("Il dominio risolve a un IP privato o locale, quindi non e permesso.");
  }

  return url.toString();
}

async function fetchSafeText(value, options = {}, redirects = 0) {
  if (redirects > 3) {
    throw new Error("Troppi redirect durante il download del feed.");
  }

  const safeUrl = await assertSafeExternalUrl(value);
  const response = await fetch(safeUrl, {
    ...options,
    redirect: "manual"
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Redirect senza destinazione.");
    }
    const nextUrl = new URL(location, safeUrl).toString();
    return fetchSafeText(nextUrl, options, redirects + 1);
  }

  if (!response.ok) {
    throw new Error(`Errore download feed: HTTP ${response.status}`);
  }

  return response.text();
}

module.exports = {
  assertSafeExternalUrl,
  fetchSafeText,
  isAllowedHostname
};