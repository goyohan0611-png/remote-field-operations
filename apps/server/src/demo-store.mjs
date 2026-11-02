// UI와 로컬 서버가 같은 계약을 사용한다. 데이터는 프로세스 메모리에만 보관한다.
export const demoUser = Object.freeze({ id: 'demo-user', username: 'demo', name: '데모 관리자', role: 'admin', status: 'approved' });
export class DemoError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const keys = ['nvr', 'rtsp', 'ftp', 'ssh', 'rdp', 'cam'];
const copy = value => structuredClone(value);
export function createDemoStore() {
  const listeners = new Set();
  const academies = ['A', 'B', 'C'].map((name, i) => ({ id: String(i + 1), name: `가상 교육센터 ${name}` }));
  const sites = Array.from({ length: 8 }, (_, i) => ({
    id: String(i + 1), academyId: academies[Math.floor(i / 3)].id,
    academyName: academies[Math.floor(i / 3)].name, room: `${i % 3 + 1}강의실`, building: '본관',
    ip: `192.0.2.${21 + i}`, basePort: 0, connectionMode: 'tunnel',
    lanCidr: '192.168.1.0/24', nvrLocalIp: '192.168.1.101', cameraLocalIp: '192.168.1.105',
    cameraType: ['g320', 'ltc2', 'kato'][i % 3], cloudLearningMode: i % 2 ? 'local' : 'cloud',
    quietTo: '23:00', installedAt: '2026-01-01',
  }));
  let checkIntervalMs = 300000, checkEnabled = true;
  const notes = [], memos = new Map(), tasks = [];
  let heartbeat = null;
  function snapshot() {
    const now = new Date().toISOString();
    const statuses = {}, agentStatuses = {};
    for (const [i, site] of sites.entries()) {
      const offline = i === 7;
      statuses[site.id] = { siteId: site.id, checkedAt: now,
        checks: Object.fromEntries(keys.map(key => [key, offline ? 'unknown' : i === 4 && key === 'cam' ? 'offline' : 'online'])),
        ...(offline ? {} : { isRecording: i === 1 || i === 3, hddUsedPct: i === 5 ? 94.2 : Number((18 + i * 7.1).toFixed(1)), firmwareVersion: '1.2.5', recorderTime: now, recorderTimeDiff: 0 }),
      };
      agentStatuses[site.id] = { siteId: site.id, connection: offline ? 'offline' : 'online', academyConnection: 'online',
        diagnosis: offline ? 'kiosk_agent_offline' : i === 4 ? 'site_device_issue' : 'normal', hostname: `demo-site-${site.id}`,
        version: '1.0.0', localIp: '192.168.1.103', lastSeenAt: offline ? new Date(Date.now() - 600000).toISOString() : now,
        heartbeatAgeMs: offline ? 600000 : 0, tunnelState: offline ? 'offline' : 'online', tunnelIpv4: `192.0.2.${51 + i}`,
        currentPublicIp: `203.0.113.${21 + i}`,
        agentEdition: 'tunnel-preview',
      };
    }
    if (heartbeat) {
      const age = Date.now() - heartbeat.receivedAt;
      statuses['1'] = age < 150000 ? { siteId: '1', checkedAt: heartbeat.health.measuredAt, ...heartbeat.health } : { siteId: '1', checkedAt: heartbeat.health.measuredAt, stale: true, checks: Object.fromEntries(keys.map(k => [k, 'unknown'])) };
      agentStatuses['1'] = { ...agentStatuses['1'], lastSeenAt: new Date(heartbeat.receivedAt).toISOString(), heartbeatAgeMs: age, connection: age < 150000 ? 'online' : 'offline' };
    }
    return copy({ academies, sites, statuses, agentStatuses, checkIntervalMs, checkEnabled });
  }
  function publish() { for (const listener of listeners) listener('dashboard:snapshot', snapshot()); }
  const files = (path = '/') => ({ path, items: path === '/' ? [
    { name: '수학 기초', size: 0, modifiedAt: null, isDirectory: true },
    { name: '영어 독해', size: 0, modifiedAt: null, isDirectory: true },
    { name: '샘플 강의.mp4', size: 448790528, modifiedAt: new Date().toISOString(), isDirectory: false },
  ] : [{ name: '샘플 강의 01.mp4', size: 448790528, modifiedAt: new Date().toISOString(), isDirectory: false }] });
  function recordings() {
    const events = [];
    for (const [i, site] of sites.slice(0, 6).entries()) {
      const kinds = i === 1 ? ['recording', 'metadata'] : ['recording', 'metadata', 'stopped', i === 4 ? 'failed' : i % 2 ? 'saved' : 'complete'];
      kinds.forEach((kind, step) => events.push({ site_id: Number(site.id), session_id: `demo-${site.id}`, academy: site.academyName, room: site.room, cloud_mode: site.cloudLearningMode,
        agent_last_seen: new Date().toISOString(), payload: { id: `demo-${site.id}-${step}`, kind,
          at: new Date(Date.now() - (kinds.length - step) * 60000).toISOString(), account: 'demo-teacher', course: i % 2 ? '영어 독해' : '수학 기초', title: `샘플 강의 ${i + 1}`, filePath: '/demo/샘플 강의.mp4' } }));
    }
    return { events, truncated: false };
  }
  async function handle(method, rawPath, body = {}) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new DemoError(400, '요청 본문 형식이 올바르지 않습니다.');
    const url = new URL(rawPath, 'http://demo.invalid');
    const path = url.pathname;
    if (method === 'GET' && path === '/api/product-profile') return { edition: 'tunnel-preview', supportedEditions: ['tunnel-preview'] };
    if (method === 'GET' && path === '/api/dashboard') return snapshot();
    if (path === '/api/auth/me' && method === 'GET') return copy(demoUser);
    if (path === '/api/academies' && method === 'GET') return copy(academies);
    if (path === '/api/recording-history' && method === 'GET') return recordings();
    if (path === '/api/notes' && method === 'GET') return copy(notes);
    if (path === '/api/notes' && method === 'POST') {
      const item = { id: String(notes.length + 1), content: String(body.content || '').slice(0, 4000), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; notes.push(item); return copy(item);
    }
    const memo = path.match(/^\/api\/sites\/([1-8])\/memos$/);
    if (memo && ['GET', 'POST'].includes(method)) {
      const items = memos.get(memo[1]) || [];
      if (method === 'GET') return copy(items);
      const item = { id: String(items.length + 1), siteId: memo[1], content: String(body.content || '').slice(0, 4000), authorName: demoUser.name, createdAt: new Date().toISOString() };
      items.push(item); memos.set(memo[1], items); return copy(item);
    }
    if (path === '/api/service-tasks/paged' && method === 'GET') return { items: copy(tasks), counts: { pending: 0, completed: 0 }, page: 1, pageSize: 20, total: 0, totalPages: 1 };
    if (path === '/api/admin/users' && method === 'GET') return [copy(demoUser)];
    if (path === '/api/admin/agents/updates' && method === 'GET') return { agents: [], releases: [], deployments: [], checks: [] };
    if (path.endsWith('/files') && method === 'GET' && /^\/api\/sites\/[1-8]\/files$/.test(path)) return files(url.searchParams.get('path') || '/');
    if (method === 'POST' && path === '/api/sites/refresh-agent-statuses') { publish(); return { requested: sites.length, completed: sites.length, timedOut: 0 }; }
    if (method === 'POST' && /^\/api\/sites\/[1-8]\/check$/.test(path)) return snapshot().statuses[path.split('/')[3]];
    if (method === 'PUT' && path === '/api/settings/check-interval') {
      if (body.intervalMs !== undefined && ![60000, 180000, 300000, 600000, 1800000, 3600000].includes(body.intervalMs)) throw new DemoError(400, '검사 주기가 올바르지 않습니다.');
      if (body.intervalMs !== undefined) checkIntervalMs = body.intervalMs;
      if (typeof body.enabled === 'boolean') checkEnabled = body.enabled;
      publish(); return { checkIntervalMs, checkEnabled };
    }
    if (method === 'POST' && path === '/api/demo/heartbeat') {
      const health = body.health;
      if (body.siteId !== '1' || !health || !keys.every(k => ['online', 'offline', 'unknown', 'skipped'].includes(health.checks?.[k]))
        || !Number.isFinite(health.hddUsedPct) || health.hddUsedPct < 0 || health.hddUsedPct > 100
        || typeof health.isRecording !== 'boolean' || typeof health.measuredAt !== 'string'
        || !Number.isFinite(Date.parse(health.measuredAt)) || Math.abs(Date.now() - Date.parse(health.measuredAt)) > 300000) throw new DemoError(400, '가상 상태 형식이 올바르지 않습니다.');
      heartbeat = { receivedAt: Date.now(), health: { checks: Object.fromEntries(keys.map(k => [k, health.checks[k]])), hddUsedPct: health.hddUsedPct, isRecording: health.isRecording, measuredAt: health.measuredAt, firmwareVersion: '1.0.0-demo' } };
      publish(); return { ok: true, heartbeatIntervalSeconds: 15 };
    }
    if (method === 'GET' && path === '/api/demo/agent-status') return { receivedAt: heartbeat ? new Date(heartbeat.receivedAt).toISOString() : null };
    // 등록키·실제 인증·장비 삭제·업데이트 등은 이 데모 서버에서 구현하지 않는다.
    throw new DemoError(403, '데모에서는 이 작업을 실행하지 않습니다. 실제 장비와 설정은 변경되지 않습니다.');
  }
  return { handle, snapshot, files, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
