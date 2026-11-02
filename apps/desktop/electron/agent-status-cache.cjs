const STATUS_TTL_MS = 150_000;

// 서버 시각은 표시 용도로만 사용한다. 만료는 서버가 보낸 경과 시간과
// 각 프로세스의 단조 시간으로 계산하여 PC 시각/시간 동기화에 영향받지 않는다.
function createAgentStatusCache(now = () => performance.now()) {
  const entries = new Map();
  function observe(statuses, replace = false) {
    if (replace) entries.clear();
    const receivedAt = now();
    for (const status of Object.values(statuses || {})) {
      if (!status || !/^[1-9]\d*$/.test(String(status.siteId))) continue;
      // 구서버는 경과 시간을 보내지 않으므로 서버의 online 판정을 최대 150초 유지한다.
      const age = status.heartbeatAgeMs === undefined ? 0 : status.heartbeatAgeMs;
      const validAge = typeof age === 'number' && Number.isFinite(age) && age >= 0;
      entries.set(String(status.siteId), {
        status: { ...status, statusFreshness: 'fresh' },
        expiresAt: receivedAt + (validAge ? Math.max(0, STATUS_TTL_MS - age) : 0),
      });
    }
  }
  function read(siteId) {
    const entry = entries.get(String(siteId));
    if (!entry) return undefined;
    if (entry.status.statusFreshness === 'fresh' && now() >= entry.expiresAt) {
      entry.status = { ...entry.status, connection: 'offline', diagnosis: 'checking', statusFreshness: 'expired' };
    }
    return entry.status;
  }
  function disconnect() {
    for (const entry of entries.values()) {
      entry.status = { ...entry.status, connection: 'offline', diagnosis: 'checking', statusFreshness: 'disconnected' };
    }
  }
  return {
    observe,
    read,
    disconnect,
    clear: () => entries.clear(),
    snapshot: () => Object.fromEntries([...entries.keys()].map((id) => [id, read(id)])),
  };
}

module.exports = { createAgentStatusCache, STATUS_TTL_MS };
