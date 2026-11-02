import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';
import { useAppDialog } from '../../components/AppDialog';

type Release = { id: string; version: string; enabled: boolean };
type Agent = { id: string; site_id: number; academy_name: string; site_name: string; version: string;
  updater_protocol: number | null; updater_last_seen_at: string | null;
  updater_immediate_supported?: boolean; last_seen_at?: string | null };
type UpdateCheck = { id: string; agent_id: string; status: string; requested_at: string; updated_at: string };
type Deployment = { id: string; agent_id: string; target_version: string; status: string; detail: string | null; updated_at: string };
type Overview = { releases: Release[]; agents: Agent[]; deployments: Deployment[]; automatic?: Release | null; checks?: UpdateCheck[] };
const checkLabels: Record<string, string> = {
  requested: '즉시 확인 요청됨', started: '업데이트 작업 실행됨', confirmed: '업데이트 확인 완료 (설치 완료 아님)',
  failed: '작업 실행 실패 · 현장 예약 작업 확인 필요', expired: '확인 시간 초과 · 전원/연결/예약 작업 확인 필요',
};
export function canRequestImmediateCheck(agent: Agent) {
  const elapsed = Date.now() - Date.parse(agent.last_seen_at || '');
  return agent.updater_immediate_supported === true && Number.isFinite(elapsed) && elapsed < 120_000 && elapsed >= -30_000;
}
const statusLabels: Record<string, string> = {
  queued: '승인됨 · 확인 대기', downloading: '다운로드 중', installing: '설치·통신 확인 중',
  succeeded: '완료', failed: '실패', rolled_back: '이전 버전 복구', cancelled: '취소됨',
};
const detailLabels: Record<string, string> = {
  version_not_newer: '상위 버전이 아님', verification_failed: '서명·파일 검증 실패', download_failed: '다운로드 실패',
  install_failed: '설치 실패', recovered: '이전 실행 파일로 복구됨', rollback_failed: '현장 수동 복구 필요', healthy: '새 버전 통신 확인',
};
const activeStatuses = ['queued', 'downloading', 'installing'];

export function canSelectUpdate(agent: Agent, release: Release | undefined, deployment?: Deployment) {
  if (!release?.enabled || agent.updater_protocol !== 1 || (deployment && activeStatuses.includes(deployment.status))) return false;
  const version = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
  if (!version.test(agent.version) || !version.test(release.version)) return false;
  const installed = agent.version.split('.').map(Number);
  const target = release.version.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (installed[i] !== target[i]) return target[i] > installed[i]; }
  return false;
}

export function updateSelectionReason(agent: Agent, release: Release | undefined, deployment?: Deployment) {
  if (agent.updater_protocol !== 1) return '최초 설치기 적용 필요';
  if (!release) return '배포 버전 선택 필요';
  if (!release.enabled) return '배포 중단된 버전';
  if (deployment && activeStatuses.includes(deployment.status)) return '현재 배포 진행 중';
  if (!/^\d+\.\d+\.\d+$/.test(agent.version)) return '현재 버전 확인 필요';
  if (!canSelectUpdate(agent, release, deployment)) return `${release.version}은 현재 버전보다 새 버전이 아님`;
  return '';
}

export function AgentUpdates({ apiUrl }: { apiUrl: string }) {
  const dialog = useAppDialog();
  const [data, setData] = useState<Overview>({ releases: [], agents: [], deployments: [] });
  const [releaseId, setReleaseId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [payload, setPayload] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestResult, setRequestResult] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [refreshResult, setRefreshResult] = useState('');
  const fingerprint = useRef<string | null>(null);
  const pendingRefresh = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);
  const endpoint = `${apiUrl}/api/admin/agent-updates`;
  const refresh = useCallback((replace = false) => {
    // 자동·수동 조회는 합치고, 승인/취소 이후에는 이전 조회를 취소해 오래된 응답을 막는다.
    if (pendingRefresh.current && !replace) return pendingRefresh.current.promise;
    pendingRefresh.current?.controller.abort();
    const request = { controller: new AbortController(), promise: Promise.resolve() };
    pendingRefresh.current = request;
    setRefreshing(true);
    setRefreshError('');
    request.promise = (async () => {
      try {
        const response = await axios.get<Overview>(endpoint, { signal: request.controller.signal, timeout: 15_000 });
        if (pendingRefresh.current !== request || request.controller.signal.aborted) return;
        const next = JSON.stringify(response.data);
        setRefreshResult(fingerprint.current === next ? '조회 완료 · 변경 없음' : '조회 완료 · 최신 상태 반영');
        fingerprint.current = next;
        setData(response.data);
        setLastRefreshedAt(new Date());
      } catch (cause) {
        if (pendingRefresh.current === request && !request.controller.signal.aborted && !axios.isCancel(cause)) {
          setRefreshError('배포 상태 조회 실패 · 서버 연결을 확인하고 다시 조회하세요.');
        }
      } finally {
        if (pendingRefresh.current === request) {
          pendingRefresh.current = null;
          setRefreshing(false);
        }
      }
    })();
    return request.promise;
  }, [endpoint]);
  useEffect(() => {
    fingerprint.current = null;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 20_000);
    return () => {
      pendingRefresh.current?.controller.abort();
      pendingRefresh.current = null;
      window.clearInterval(timer);
    };
  }, [refresh]);
  const release = data.releases.find(item => item.id === releaseId);
  const latest = (id: string) => data.deployments.find(item => item.agent_id === id);
  const eligible = data.agents.filter(agent => selected.includes(agent.id) && canSelectUpdate(agent, release, latest(agent.id)));
  const checkable = data.agents.filter(agent => selected.includes(agent.id) && canRequestImmediateCheck(agent));
  const visibleAgents = data.agents.filter(agent => `${agent.academy_name} ${agent.site_name}`.includes(search));
  async function run(label: string, action: () => Promise<void>) {
    setBusy(true); setError(''); setRequestResult('');
    try { await action(); await refresh(true); }
    catch (cause) {
      const detail = axios.isAxiosError(cause)
        ? String(cause.response?.data?.error || (cause.response ? `서버 응답 ${cause.response.status}` : '서버에 연결하지 못했습니다.'))
        : cause instanceof Error ? cause.message : '요청 실패';
      setError(`${label} 실패 · ${detail}`);
    }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!payload || !metadata) return;
    await run('파일 등록', async () => {
      if (payload.size > 128 * 1024 * 1024 || metadata.size > 32768) throw new Error('파일 크기 제한을 초과했습니다.');
      const manifest = JSON.parse(await metadata.text());
      if (manifest.edition !== 'tunnel-preview' || !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
          manifest.size !== payload.size || typeof manifest.signature !== 'string') throw new Error('배포 파일과 명세가 맞지 않습니다.');
      const digest = await crypto.subtle.digest('SHA-256', await payload.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (sha256 !== manifest.sha256) throw new Error('파일 SHA256이 다릅니다. 같은 버전의 EXE와 명세를 선택하세요.');
      const response = await axios.post<Release>(`${endpoint}/releases/${manifest.version}`, payload, {
        headers: { 'Content-Type': 'application/octet-stream', 'X-Agent-Signature': manifest.signature }, timeout: 300_000,
      });
      setReleaseId(response.data.id); setSelected([]);
    });
  }
  async function approve() {
    if (!release || !eligible.length || !await dialog.confirm({ title: '선택 현장 업데이트 승인',
      message: `${eligible.length}개 현장에 ${release.version} 버전을 승인합니다. 최대 약 15분 후 확인하며 설치 중 원격 연결이 잠시 끊길 수 있습니다. 먼저 테스트 현장 1곳에서 검증하세요.`, confirmText: '배포 승인' })) return;
    await run('배포 승인', async () => { await axios.post(`${endpoint}/approve`, { releaseId, agentIds: eligible.map(a => a.id) }); setSelected([]); });
  }
  async function stopRelease() {
    if (!release || !await dialog.confirm({ title: '이 버전 배포 중단',
      message: `${release.version}의 대기·다운로드 중인 배포를 모두 취소합니다. 이미 설치를 시작한 현장은 안전하게 완료 또는 복구합니다.`, confirmText: '배포 중단', tone: 'danger' })) return;
    await run('배포 중단', async () => { await axios.post(`${endpoint}/releases/${release.id}/stop`); setReleaseId(''); setSelected([]); });
  }
  async function checkNow() {
    if (!checkable.length || checkable.length > 20) return;
    await run('업데이트 확인 요청', async () => {
      await axios.post(`${endpoint}/check-now`, { agentIds: checkable.map(agent => agent.id) }, { timeout: 15_000 });
      setRequestResult(`${checkable.length}곳에 업데이트 확인을 요청했습니다. 아래 현장별 결과를 확인하세요. 설치 완료를 의미하지 않습니다.`);
      setSelected([]);
    });
  }
  return <section className="agent-updates" aria-label="에이전트 자동 업데이트">
    <h3>에이전트 자동 업데이트</h3>
    <p className="agent-update-release-status" role="status">{data.automatic ? `자동 배포 버전: ${data.automatic.version} · ${data.automatic.enabled ? '사용 중' : '배포 중단됨'}` : '자동 배포 버전 미등록 · 서버 업데이트를 확인하세요.'}</p>
    <fieldset className="agent-update-register" disabled={busy}>
      <legend>수동 배포 파일 등록 (필요할 때만)</legend>
      <label>에이전트 EXE (setup 설치파일 아님)<input type="file" accept=".exe" onChange={e => setPayload(e.target.files?.[0] || null)} /></label>
      <label>같은 버전의 .update.json<input type="file" accept=".json" onChange={e => setMetadata(e.target.files?.[0] || null)} /></label>
      <button type="button" className="agent-update-primary" disabled={!payload || !metadata} onClick={() => void upload()}>파일 등록</button>
    </fieldset>
    <fieldset className="agent-update-management" disabled={busy}>
      <legend>배포 관리 · 수동 재시도</legend>
      <label>배포 버전<select value={releaseId} onChange={e => { setReleaseId(e.target.value); setSelected([]); }}>
        <option value="">버전 선택</option>{data.releases.filter(r => r.enabled).map(r => <option key={r.id} value={r.id}>{r.version}</option>)}
      </select></label>
      <label>현장 검색<input value={search} onChange={e => setSearch(e.target.value)} placeholder="학원 또는 강의실" /></label>
      <div className="agent-update-actions">
        <button type="button" className="agent-update-primary" disabled={!eligible.length} onClick={() => void approve()}>선택 {eligible.length}곳 승인</button>
        <button type="button" disabled={!checkable.length || checkable.length > 20} onClick={() => void checkNow()}>지금 업데이트 확인 ({checkable.length}곳)</button>
        <button type="button" className="agent-update-danger" disabled={!release} onClick={() => void stopRelease()}>이 버전 배포 중단</button>
      </div>
      <div className="agent-update-refresh">
        <button type="button" className="agent-update-refresh-button" disabled={refreshing}
          aria-busy={refreshing} onClick={() => { setError(''); void refresh(); }}>
          <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'spin' : undefined} />
          {refreshing ? '조회 중…' : '배포 상태 조회'}
        </button>
        <span role="status" aria-live="polite" className="agent-update-refresh-result">
          {refreshing ? '최신 배포 상태를 확인하고 있습니다.' : refreshError ? '조회 실패 · 이전 결과 유지' : refreshResult}
        </span>
        <small className="agent-update-refresh-time">{lastRefreshedAt
          ? `마지막 성공 조회 ${lastRefreshedAt.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })} (한국시간)`
          : '아직 조회에 성공하지 않았습니다.'}</small>
      </div>
    </fieldset>
    {requestResult && <p role="status">{requestResult}</p>}
    {refreshError && <p role="alert">{refreshError}</p>}
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">처리 중입니다…</p>}
    <div className="agent-update-table"><table><thead><tr><th>선택</th><th>현장 / 현재 버전</th><th>업데이트 확인</th><th>최근 배포</th></tr></thead>
      <tbody>{visibleAgents.map(agent => {
        const job = latest(agent.id);
        const check = data.checks?.find(item => item.agent_id === agent.id);
        const stalled = job && activeStatuses.includes(job.status) && Date.now() - Date.parse(job.updated_at) > 30 * 60_000;
        return <tr key={agent.id}>
          <td><input aria-label={`${agent.academy_name} ${agent.site_name} 선택`} type="checkbox" checked={selected.includes(agent.id)}
            disabled={busy || (!canSelectUpdate(agent, release, job) && !canRequestImmediateCheck(agent))} onChange={e => setSelected(current => e.target.checked ? [...current, agent.id] : current.filter(id => id !== agent.id))} /></td>
          <td>{agent.academy_name} · {agent.site_name}<br /><small>#{agent.site_id} · {agent.version}</small></td>
          <td>{agent.updater_protocol === 1 ? agent.updater_last_seen_at ? new Date(agent.updater_last_seen_at).toLocaleString() : '확인 대기' : '최초 수동 설치 필요'}
            <br /><small>{!agent.updater_immediate_supported ? '즉시 확인: 설치기 적용 필요' : !canRequestImmediateCheck(agent) ? '즉시 확인: 현장 오프라인' : '즉시 확인 가능'}</small>
            {!canSelectUpdate(agent, release, job) && <><br /><small>배포 선택 불가: {updateSelectionReason(agent, release, job)}</small></>}
            {check && <p>{checkLabels[check.status] || '확인 상태 조회 필요'}<br /><small>요청 {new Date(check.requested_at).toLocaleString()}</small></p>}</td>
          <td>{job ? <>{job.target_version} · {statusLabels[job.status] || job.status}<br /><small>{job.detail ? detailLabels[job.detail] || job.detail : ''}</small>
            {stalled && <p>확인 지연 · 현장 전원/작업 로그 확인 필요</p>}
            {['queued', 'downloading'].includes(job.status) && <button type="button" disabled={busy} onClick={() => void run('배포 취소', async () => { await axios.post(`${endpoint}/${job.id}/cancel`); })}>배포 취소</button>}</> : '배포 이력 없음'}</td>
        </tr>;
      })}{visibleAgents.length === 0 && <tr><td colSpan={4} className="agent-update-empty">표시할 현장이 없습니다.</td></tr>}</tbody></table></div>
  </section>;
}
