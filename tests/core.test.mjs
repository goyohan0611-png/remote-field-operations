import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthKeyRequest, TailscaleProvisioner } from '../apps/server/implementation/tailscale.ts';
import { expireAgentStatus } from '../apps/server/implementation/agent-freshness.ts';
import { requestAgentStatusRefresh, waitForAgentCommand, waitForAgentStatusUpdate, notifyAgentStatusUpdated } from '../apps/server/implementation/agent-command-broker.ts';

test('Tailscale 등록키 요청은 일회용·비임시·태그 지정이고 TTL을 제한한다', () => {
  const request = createAuthKeyRequest('tag:fieldlink', 99999, '1');
  assert.equal(request.capabilities.devices.create.reusable, false);
  assert.equal(request.capabilities.devices.create.ephemeral, false);
  assert.deepEqual(request.capabilities.devices.create.tags, ['tag:fieldlink']);
  assert.equal(request.expirySeconds, 3600);
  assert.throws(() => createAuthKeyRequest('invalid', 300, '1'));
});
test('자격증명이 비어 있으면 OAuth 요청을 전송하지 않는다', async () => {
  let requests = 0;
  const client = new TailscaleProvisioner({ oauthClientId: '', oauthClientSecret: '', agentTag: 'tag:fieldlink', authKeyTtlSeconds: 300, timeoutMs: 1000 }, async () => { requests++; throw new Error('호출하면 안 됨'); });
  await assert.rejects(client.createOneTimeAuthKey('1'), /tailscale_not_configured/);
  assert.equal(requests, 0);
});
test('오래된 장비 측정은 미확인으로 바꾸고 HDD·녹화 상태를 이어 붙이지 않는다', () => {
  const status = { siteId: '1', checkedAt: new Date(Date.now() - 300000).toISOString(), hddUsedPct: 33, isRecording: true, checks: { nvr: 'online', rtsp: 'online', ftp: 'online', ssh: 'online', rdp: 'online', cam: 'skipped' } };
  const expired = expireAgentStatus(status, true);
  assert.equal(expired.stale, true); assert.equal(expired.checks.nvr, 'unknown');
  assert.equal(expired.checks.cam, 'skipped'); assert.equal(expired.hddUsedPct, undefined);
});
test('상태 갱신 요청은 같은 요청 ID를 가진 측정 응답으로 완료한다', async () => {
  requestAgentStatusRefresh(['1'], 'demo-request');
  const command = await waitForAgentCommand('1', 100);
  assert.equal(command.requestId, 'demo-request');
  const completed = waitForAgentStatusUpdate('1', 'demo-request', 100);
  const status = { siteId: '1', checkedAt: new Date().toISOString(), checks: {} };
  notifyAgentStatusUpdated(status, 'demo-request');
  assert.deepEqual(await completed, status);
});
