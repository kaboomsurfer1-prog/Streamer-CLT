const fs = require("node:fs/promises");
const path = require("node:path");
const {
  DEFAULT_TEMPLATES,
  getAllowedRoleIds,
  getCheckIntervalSeconds,
  getGuildId
} = require("./config");

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDefaultData() {
  return {
    version: 1,
    guildId: getGuildId(),
    allowedRoleIds: getAllowedRoleIds(),
    settings: {
      checkIntervalSeconds: getCheckIntervalSeconds()
    },
    defaultChannels: {
      live: null,
      video: null
    },
    templates: {
      ...DEFAULT_TEMPLATES
    },
    counters: {
      source: 0
    },
    sources: []
  };
}

function normalizeSource(source) {
  return {
    id: Number(source.id),
    type: source.type,
    platform: source.platform,
    username: source.username,
    displayName: source.displayName || source.username,
    discordUserId: source.discordUserId || null,
    tagMode: source.tagMode || (source.mentionRoleId ? "role" : source.discordUserId ? "user" : "none"),
    channelId: source.channelId || null,
    mentionRoleId: source.mentionRoleId || null,
    url: source.url || null,
    feedUrl: source.feedUrl || null,
    customMessage: source.customMessage || null,
    enabled: source.enabled !== false,
    manualOnly: source.manualOnly === true,
    cursorReady: source.cursorReady === true,
    notifyOnFirstCheck: source.notifyOnFirstCheck === true,
    lastEventId: source.lastEventId || null,
    lastLive: source.lastLive === true,
    lastCheckedAt: source.lastCheckedAt || null,
    lastNotifiedAt: source.lastNotifiedAt || null,
    lastError: source.lastError || null,
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso()
  };
}

function normalizeData(data) {
  const defaults = buildDefaultData();
  const normalized = {
    ...defaults,
    ...data,
    settings: {
      ...defaults.settings,
      ...(data.settings || {})
    },
    defaultChannels: {
      ...defaults.defaultChannels,
      ...(data.defaultChannels || {})
    },
    templates: {
      ...defaults.templates,
      ...(data.templates || {})
    },
    counters: {
      ...defaults.counters,
      ...(data.counters || {})
    },
    allowedRoleIds: Array.isArray(data.allowedRoleIds)
      ? data.allowedRoleIds.map(String)
      : defaults.allowedRoleIds,
    sources: Array.isArray(data.sources) ? data.sources.map(normalizeSource) : []
  };

  normalized.counters.source = Math.max(
    Number(normalized.counters.source) || 0,
    ...normalized.sources.map((source) => source.id),
    0
  );

  return normalized;
}

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.data = normalizeData(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.data = buildDefaultData();
      await this.save();
    }
  }

  snapshot() {
    if (!this.data) {
      throw new Error("Store not loaded");
    }
    return clone(this.data);
  }

  async save() {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    await fs.rename(tmpPath, this.filePath);
  }

  async mutate(fn) {
    const run = this.queue.catch(() => undefined).then(async () => {
      const result = await fn(this.data);
      await this.save();
      return result;
    });

    this.queue = run;
    return run;
  }

  async addSource(input) {
    return this.mutate((data) => {
      const id = data.counters.source + 1;
      data.counters.source = id;
      const source = normalizeSource({
        ...input,
        id,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
      data.sources.push(source);
      return clone(source);
    });
  }

  async updateSource(id, patch) {
    return this.mutate((data) => {
      const source = data.sources.find((item) => item.id === Number(id));
      if (!source) return null;
      Object.assign(source, patch, { updatedAt: nowIso() });
      return clone(source);
    });
  }

  async removeSource(id) {
    return this.mutate((data) => {
      const index = data.sources.findIndex((item) => item.id === Number(id));
      if (index === -1) return null;
      const [removed] = data.sources.splice(index, 1);
      return clone(removed);
    });
  }

  async setDefaultChannel(type, channelId) {
    return this.mutate((data) => {
      data.defaultChannels[type] = channelId;
      return clone(data.defaultChannels);
    });
  }

  async setTemplate(type, template) {
    return this.mutate((data) => {
      data.templates[type] = template;
      return data.templates[type];
    });
  }

  async resetTemplate(type) {
    return this.mutate((data) => {
      data.templates[type] = DEFAULT_TEMPLATES[type];
      return data.templates[type];
    });
  }

  async addAllowedRole(roleId) {
    return this.mutate((data) => {
      const id = String(roleId);
      if (!data.allowedRoleIds.includes(id)) {
        data.allowedRoleIds.push(id);
      }
      return clone(data.allowedRoleIds);
    });
  }

  async removeAllowedRole(roleId) {
    return this.mutate((data) => {
      const id = String(roleId);
      data.allowedRoleIds = data.allowedRoleIds.filter((item) => item !== id);
      return clone(data.allowedRoleIds);
    });
  }
}

module.exports = {
  JsonStore,
  nowIso
};