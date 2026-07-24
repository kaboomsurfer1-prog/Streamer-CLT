const MAX_LOG_ENTRIES = 400;
const buffer = [];
let seq = 0;

function stamp() {
  return new Date().toISOString();
}

function formatMeta(meta) {
  if (meta === undefined || meta === null) return "";
  if (meta instanceof Error) return meta.stack || meta.message;
  if (typeof meta === "string") return meta;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

function record(level, time, message, meta) {
  const metaText = formatMeta(meta);
  const full = metaText ? `${message} ${metaText}` : String(message);
  seq += 1;
  buffer.push({ seq, ts: time, level, message: full.slice(0, 2000) });
  if (buffer.length > MAX_LOG_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_LOG_ENTRIES);
  }
}

function info(message, meta) {
  const time = stamp();
  record("INFO", time, message, meta);
  if (meta) {
    console.log(`[${time}] INFO ${message}`, meta);
    return;
  }
  console.log(`[${time}] INFO ${message}`);
}

function warn(message, meta) {
  const time = stamp();
  record("WARN", time, message, meta);
  if (meta) {
    console.warn(`[${time}] WARN ${message}`, meta);
    return;
  }
  console.warn(`[${time}] WARN ${message}`);
}

function error(message, meta) {
  const time = stamp();
  record("ERROR", time, message, meta);
  if (meta) {
    console.error(`[${time}] ERROR ${message}`, meta);
    return;
  }
  console.error(`[${time}] ERROR ${message}`);
}

function getLogs(afterSeq = 0) {
  const after = Number(afterSeq) || 0;
  return buffer.filter((entry) => entry.seq > after);
}

module.exports = {
  error,
  getLogs,
  info,
  warn
};
