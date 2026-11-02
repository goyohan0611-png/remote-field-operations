import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createDemoStore } from '../apps/server/src/demo-store.mjs';
import { createDemoServer } from '../apps/server/src/server.mjs';

test('가상 현장 데이터는 별도 저장소에 격리되고 응답 변경이 내부 상태를 바꾸지 않는다', async () => {
  const first = createDemoStore(), second = createDemoStore();
  const snapshot = await first.handle('GET', '/api/dashboard');
  assert.equal(snapshot.sites.length, 8);
  assert.ok(snapshot.sites.every(site => site.academyName.startsWith('가상 ')));
  snapshot.sites[0].academyName = '변경';
  assert.equal(first.snapshot().sites[0].academyName, '가상 교육센터 A');
  await first.handle('POST', '/api/notes', { content: '<script>샘플</script>' });
  assert.equal((await second.handle('GET', '/api/notes')).length, 0);
});
test('미응답 장비는 측정값이 없고 상태를 정상으로 만들지 않는다', () => {
  const snapshot = createDemoStore().snapshot();
  assert.ok(Object.values(snapshot.statuses['8'].checks).every(state => state === 'unknown'));
  assert.equal(snapshot.statuses['8'].hddUsedPct, undefined);
  assert.equal(snapshot.agentStatuses['8'].connection, 'offline');
});
test('정상 가상 heartbeat만 허용하고 서버 상태에 반영한다', async () => {
  const store = createDemoStore();
  const health = { checks: Object.fromEntries(['nvr', 'rtsp', 'ftp', 'ssh', 'rdp', 'cam'].map(k => [k, 'online'])), hddUsedPct: 42.5, isRecording: true, measuredAt: new Date().toISOString() };
  await assert.rejects(store.handle('POST', '/api/demo/heartbeat', { siteId: '2', health }));
  await assert.rejects(store.handle('POST', '/api/demo/heartbeat', { siteId: '1', health: { ...health, hddUsedPct: 101 } }));
  await assert.rejects(store.handle('POST', '/api/demo/heartbeat', { siteId: '1', health: { ...health, checks: {} } }));
  await store.handle('POST', '/api/demo/heartbeat', { siteId: '1', health });
  assert.equal(store.snapshot().statuses['1'].hddUsedPct, 42.5);
});
test('인증키 발급·실제 삭제·업데이트·임의 URL은 지원하지 않는다', async () => {
  const store = createDemoStore();
  for (const path of ['/api/auth/login', '/api/sites/1/files/delete', '/api/admin/sites/1/agent-enrollment', '/api/admin/agents/updates/install', '/http://example.invalid']) {
    await assert.rejects(store.handle('POST', path), error => error.status === 403);
  }
});
test('로컬 HTTP 서버는 허용된 경로만 처리하고 타 사이트 Origin·Host를 거부한다', async () => {
  const server = createDemoServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/api/dashboard')).status, 200);
    assert.equal((await fetch(base + '/api/dashboard', { headers: { Origin: 'https://example.invalid' } })).status, 403);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const request = httpRequest(base + '/api/dashboard', { headers: { Host: 'example.invalid' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end();
    });
    assert.equal(foreignHostStatus, 403);
    const preflight = await fetch(base + '/api/demo/heartbeat', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
    assert.equal((await fetch(base + '/api/demo/heartbeat', { method: 'POST', body: '{' })).status, 400);
    assert.equal((await fetch(base + '/api/sites/1/files/delete', { method: 'POST' })).status, 403);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
