import type { SiteAgentStatus, SiteStatus } from '@fieldlink/shared';

export type SiteTone = 'online' | 'partial' | 'offline' | 'unknown';

export function siteTone(status: SiteStatus | undefined, agentStatus: SiteAgentStatus | undefined, tunnelEnabled: boolean): SiteTone {
  if (tunnelEnabled && agentStatus?.statusFreshness === 'disconnected') return 'unknown';
  if (tunnelEnabled && agentStatus?.connection === 'offline') return 'offline';
  if (!status || status.stale) return 'unknown';
  if (status.checks.nvr === 'offline') return 'offline';
  if (Object.values(status.checks).some((value) => value === 'offline')) return 'partial';
  if (status.checks.nvr === 'online') return 'online';
  return 'unknown';
}

export function siteToneLabel(tone: SiteTone, status: SiteStatus | undefined) {
  if (tone === 'offline') return '오프라인';
  if (status?.stale) return '확인 지연';
  return { online: '정상', partial: '주의', unknown: '대기' }[tone];
}
