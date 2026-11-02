import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { DashboardSnapshot, SiteAgentStatus } from '@fieldlink/shared';
import cacheModule from '../../electron/agent-status-cache.cjs';

export function applyAgentStatuses(snapshot: DashboardSnapshot, agents: Record<string, SiteAgentStatus>): DashboardSnapshot {
  let changed = Object.keys(snapshot.agentStatuses || {}).length !== Object.keys(agents).length;
  const statuses = { ...snapshot.statuses };
  for (const [id, agent] of Object.entries(agents)) {
    if (snapshot.agentStatuses?.[id] !== agent) changed = true;
    if (agent.statusFreshness !== 'fresh' && agent.statusFreshness && statuses[id] && !statuses[id].stale) {
      statuses[id] = {
        siteId: id, checkedAt: statuses[id].checkedAt, stale: true,
        checks: { nvr: 'unknown', rtsp: 'unknown', ftp: 'unknown', ssh: 'unknown', rdp: 'unknown', cam: 'unknown' },
      };
      changed = true;
    }
  }
  return changed ? { ...snapshot, statuses, agentStatuses: agents } : snapshot;
}

export function useAgentStatuses(enabled: boolean, setSnapshot: Dispatch<SetStateAction<DashboardSnapshot | null>>) {
  const [cache] = useState(() => cacheModule.createAgentStatusCache());
  const observe = useCallback((statuses: Record<string, SiteAgentStatus>, replace: boolean) => {
    if (!enabled) return statuses;
    // IPC는 버튼의 접속 요청보다 먼저 보내 최신 상태가 메인 프로세스에 반영되게 한다.
    window.kioskDesktop?.observeAgentStatuses(statuses, replace);
    cache.observe(statuses, replace);
    return cache.snapshot();
  }, [cache, enabled]);
  const disconnect = useCallback(() => {
    if (!enabled) return;
    window.kioskDesktop?.disconnectAgentStatuses();
    cache.disconnect();
    setSnapshot((current) => current ? applyAgentStatuses(current, cache.snapshot()) : current);
  }, [cache, enabled, setSnapshot]);
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => {
      const statuses = cache.snapshot();
      setSnapshot((current) => current ? applyAgentStatuses(current, statuses) : current);
    }, 1000);
    return () => {
      window.clearInterval(timer);
      window.kioskDesktop?.disconnectAgentStatuses();
      cache.clear();
    };
  }, [cache, enabled, setSnapshot]);
  return { observe, disconnect };
}

export function agentStatusLabel(status: SiteAgentStatus | undefined, fallback: string) {
  if (status?.statusFreshness === 'disconnected') return '서버 연결 끊김';
  if (status?.statusFreshness === 'expired') return '상태 확인 지연';
  return fallback;
}
