import net from 'node:net';
import type {
  AgentConnectionState,
  CheckKey,
  DeviceStatus,
  NetworkDiagnosis,
} from '@fieldlink/shared';

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [ipToNumber('0.0.0.0'), ipToNumber('0.255.255.255')],
  [ipToNumber('10.0.0.0'), ipToNumber('10.255.255.255')],
  [ipToNumber('100.64.0.0'), ipToNumber('100.127.255.255')],
  [ipToNumber('127.0.0.0'), ipToNumber('127.255.255.255')],
  [ipToNumber('169.254.0.0'), ipToNumber('169.254.255.255')],
  [ipToNumber('172.16.0.0'), ipToNumber('172.31.255.255')],
  [ipToNumber('192.0.0.0'), ipToNumber('192.0.0.255')],
  [ipToNumber('192.0.2.0'), ipToNumber('192.0.2.255')],
  [ipToNumber('192.168.0.0'), ipToNumber('192.168.255.255')],
  [ipToNumber('198.18.0.0'), ipToNumber('198.19.255.255')],
  [ipToNumber('198.51.100.0'), ipToNumber('198.51.100.255')],
  [ipToNumber('203.0.113.0'), ipToNumber('203.0.113.255')],
  [ipToNumber('224.0.0.0'), ipToNumber('255.255.255.255')],
];

function ipToNumber(value: string) {
  return value.split('.').reduce((result, part) => (result * 256) + Number(part), 0) >>> 0;
}

function isPublicIpv4(value: string) {
  const numeric = ipToNumber(value);
  return !PRIVATE_IPV4_RANGES.some(([start, end]) => numeric >= start && numeric <= end);
}

export function normalizeObservedIp(value: string | undefined) {
  if (!value) return undefined;
  const withoutZone = value.trim().split('%')[0];
  const normalized = withoutZone.startsWith('::ffff:') ? withoutZone.slice(7) : withoutZone;
  const version = net.isIP(normalized);
  if (version === 4 && isPublicIpv4(normalized)) return normalized;
  return undefined;
}

export type IpCandidateState = {
  currentPublicIp?: string;
  pendingPublicIp?: string;
  pendingCount: number;
};

export function advanceIpCandidate(state: IpCandidateState, observedPublicIp: string) {
  if (state.currentPublicIp === observedPublicIp) {
    return {
      ...state,
      pendingPublicIp: undefined,
      pendingCount: 0,
      confirmedPublicIp: undefined,
    };
  }

  const pendingCount = state.pendingPublicIp === observedPublicIp ? state.pendingCount + 1 : 1;
  return {
    ...state,
    pendingPublicIp: observedPublicIp,
    pendingCount,
    confirmedPublicIp: pendingCount >= 2 ? observedPublicIp : undefined,
  };
}

function getPortShape(checks: Record<CheckKey, DeviceStatus> | undefined) {
  if (!checks) return 'unknown';
  const values = Object.values(checks).filter((value) => value !== 'skipped');
  if (values.length === 0 || values.every((value) => value === 'unknown')) return 'unknown';
  if (values.every((value) => value === 'offline')) return 'all_offline';
  if (values.every((value) => value === 'online')) return 'all_online';
  return 'partial';
}

export function classifyNetworkDiagnosis(input: {
  connection: AgentConnectionState;
  academyConnection: AgentConnectionState;
  checks?: Record<CheckKey, DeviceStatus>;
  hasPendingPublicIp: boolean;
  recentlyChangedPublicIp: boolean;
  tunnelMode?: boolean;
}): NetworkDiagnosis {
  const ports = getPortShape(input.checks);
  if (input.connection === 'not_installed') return 'checking';

  if (input.tunnelMode) {
    if (input.academyConnection === 'offline') return 'academy_outage';
    if (input.connection === 'offline') return 'kiosk_agent_offline';
    if (ports === 'all_offline' || ports === 'partial') return 'site_device_issue';
    return ports === 'unknown' ? 'checking' : 'normal';
  }

  if (input.academyConnection === 'offline') {
    return ports === 'all_offline' ? 'academy_outage' : 'kiosk_agent_offline';
  }

  if (input.connection === 'offline' && ports !== 'all_offline') return 'kiosk_agent_offline';
  if (input.hasPendingPublicIp) return 'ip_change_checking';
  if (ports === 'all_offline') return 'port_forwarding_lost';
  if (ports === 'partial') return 'site_device_issue';
  if (ports === 'unknown') return 'checking';
  if (input.recentlyChangedPublicIp) return 'public_ip_changed';
  return 'normal';
}
