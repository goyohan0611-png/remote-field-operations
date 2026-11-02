import type { SiteStatus } from '@fieldlink/shared';

export const AGENT_STATUS_MAX_AGE_MS = 150_000;

export function isFreshMeasurement(measuredAt: string | undefined, now = Date.now()) {
  const measured = Date.parse(measuredAt || '');
  return Number.isFinite(measured) && measured <= now + 30_000 && now - measured <= AGENT_STATUS_MAX_AGE_MS;
}

export function expireAgentStatus(status: SiteStatus, agentOnline: boolean, now = Date.now()): SiteStatus {
  if (agentOnline && isFreshMeasurement(status.checkedAt, now)) return status;
  return {
    siteId: status.siteId,
    checkedAt: status.checkedAt,
    stale: true,
    checks: {
      nvr: 'unknown', rtsp: 'unknown', ftp: 'unknown', ssh: 'unknown', rdp: 'unknown',
      cam: status.checks.cam === 'skipped' ? 'skipped' : 'unknown',
    },
  };
}
