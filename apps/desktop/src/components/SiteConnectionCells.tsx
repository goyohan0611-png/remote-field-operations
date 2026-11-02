import type { SiteAgentStatus } from '@fieldlink/shared';
import { agentStatusLabel } from '../features/agent-status';

const connectionLabels = { online: '정상', offline: '오프라인', not_installed: '미설치' };

export function SiteConnectionCells({ status }: { status?: SiteAgentStatus }) {
  const connection = status?.connection || 'not_installed';
  const freshness = status?.statusFreshness;
  const tone = freshness === 'expired' || freshness === 'disconnected' ? 'unknown' : connection;
  // 목록은 현장 공인 IP를 표시하고, Tailscale·장비 주소는 상세에서 구분한다.
  const publicIp = status?.currentPublicIp;
  return <>
    <span className="site-agent-cell" aria-label="에이전트 상태">
      <span className={`site-agent-badge ${tone}`}>
        {agentStatusLabel(status, connectionLabels[connection])}
      </span>
    </span>
    <span className="site-tailscale-ip-cell" title={publicIp ? '마지막 확인된 현장 공인 IP · Tailscale과 장비 주소는 상세에서 확인하세요.' : '아직 확인된 현장 공인 IP가 없습니다.'}>
      {publicIp || '미확인'}
    </span>
  </>;
}

export function SiteListHeader({ tunnelEnabled }: { tunnelEnabled: boolean }) {
  return <div className={`site-row-header ${tunnelEnabled ? 'tunnel-layout' : ''}`} aria-hidden="true">
    <span />
    <span>현장</span>
    {tunnelEnabled ? <><span>에이전트 상태</span><span>공인 IP</span></> : <span>IP · BASE</span>}
    <span>서비스 상태</span>
    <span>FW</span><span>녹화기 시간</span><span>HDD</span>
    <span className="site-row-header-actions">작업</span>
  </div>;
}
