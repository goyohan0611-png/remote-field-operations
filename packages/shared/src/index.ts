export const CHECK_KEYS = ['nvr', 'rtsp', 'ftp', 'ssh', 'rdp', 'cam'] as const;

// 자동 검사 주기 선택지(ms): 1분 / 3분 / 5분 / 10분 / 30분 / 1시간
export const CHECK_INTERVAL_OPTIONS = [60000, 180000, 300000, 600000, 1800000, 3600000] as const;
export const DEFAULT_CHECK_INTERVAL_MS = 300000;
export const MAX_TCP_PORT = 65535;
export const MAX_SITE_BASE_PORT = 65529;
export const TUNNEL_DEFAULT_LAN_CIDR = '192.168.1.0/24';
export const TUNNEL_DEFAULT_NVR_IP = '192.168.1.101';
export const TUNNEL_DEFAULT_KIOSK_IP = '192.168.1.103';
export const TUNNEL_DEFAULT_CAMERA_IP = '192.168.1.105';

export type CheckKey = (typeof CHECK_KEYS)[number];
export type DeviceStatus = 'online' | 'offline' | 'unknown' | 'skipped';
export type CameraType = 'g320' | 'ltc2' | 'kato';
export type CloudLearningMode = 'cloud' | 'local' | 'unknown';
export type ServiceTaskStatus = 'pending' | 'completed';
export type AgentConnectionState = 'online' | 'offline' | 'not_installed';
export type TunnelState = 'disabled' | 'not_installed' | 'online' | 'needs_login' | 'offline' | 'error';
export type SiteConnectionMode = 'legacy' | 'tunnel';
export type NetworkDiagnosis =
  | 'normal'
  | 'public_ip_changed'
  | 'ip_change_checking'
  | 'port_forwarding_lost'
  | 'site_device_issue'
  | 'kiosk_agent_offline'
  | 'academy_outage'
  | 'checking';

export interface Academy {
  id: string;
  name: string;
}

export interface Site {
  id: string;
  academyId: string;
  academyName: string;
  building?: string;
  room: string;
  ip: string;
  basePort: number;
  connectionMode?: SiteConnectionMode;
  lanCidr?: string;
  nvrLocalIp?: string;
  cameraLocalIp?: string;
  cameraType: CameraType;
  phone?: string;
  installedAt?: string;
  quietFrom?: string;
  quietTo?: string;
  shutdownDetectedAt?: string;
  cloudLearningMode?: CloudLearningMode;
  cloudOrgCode?: string;
  cloudDetectedAt?: string;
}

export type SiteConnectionContext = Site & {
  agentStatus?: SiteAgentStatus;
};

export interface SiteStatus {
  siteId: string;
  checkedAt: string;
  stale?: boolean;
  checks: Record<CheckKey, DeviceStatus>;
  isRecording?: boolean;
  hddUsedPct?: number;
  firmwareVersion?: string;
  recorderTime?: string;
  recorderTimeDiff?: number;
}

export interface SiteAgentStatus {
  siteId: string;
  connection: AgentConnectionState;
  academyConnection: AgentConnectionState;
  diagnosis: NetworkDiagnosis;
  hostname?: string;
  version?: string;
  localIp?: string;
  lastSeenAt?: string;
  // 서버가 계산한 마지막 heartbeat의 경과 시간. 구서버는 생략한다.
  heartbeatAgeMs?: number;
  // 데스크톱 수신 상태이며 서버의 현장 장애 판정과 구분한다.
  statusFreshness?: 'fresh' | 'expired' | 'disconnected';
  observedPublicIp?: string;
  currentPublicIp?: string;
  previousPublicIp?: string;
  ipChangedAt?: string;
  pendingPublicIp?: string;
  tunnelState?: TunnelState;
  tunnelIpv4?: string;
  tunnelIpv6?: string;
  agentEdition?: 'stable' | 'tunnel-preview';
}

export interface AgentEnrollment {
  code: string;
  expiresAt: string;
}

export interface SiteMemo {
  id: string;
  siteId: string;
  content: string;
  authorId?: string;
  authorName?: string;
  authorUsername?: string;
  createdAt: string;
}

export interface ServiceTask {
  id: string;
  siteId: string;
  academyName: string;
  building?: string;
  room: string;
  reason: string;
  contactPhone?: string;
  academyAddress?: string;
  problemDescription?: string;
  resolutionDescription?: string;
  scheduledFor: string;
  status: ServiceTaskStatus;
  createdBy?: string;
  createdByName?: string;
  createdByUsername?: string;
  createdAt: string;
  completedBy?: string;
  completedByName?: string;
  completedByUsername?: string;
  completedAt?: string;
}

export interface SiteFileItem {
  name: string;
  size: number;
  modifiedAt: string | null;
  isDirectory: boolean;
}

export interface SiteFileList {
  path: string;
  items: SiteFileItem[];
}

export interface DashboardSnapshot {
  academies: Academy[];
  sites: Site[];
  statuses: Record<string, SiteStatus>;
  agentStatuses: Record<string, SiteAgentStatus>;
  // 현재 적용된 자동 검사 주기(ms)
  checkIntervalMs: number;
  // 자동 검사 켜짐/꺼짐
  checkEnabled: boolean;
}

export function getSiteName(site: Pick<Site, 'building' | 'room'>) {
  return [site.building, site.room].filter(Boolean).join(' ');
}

export type SiteServicePorts = {
  nvr: number;
  rtsp: number;
  ftp: number;
  ssh: number;
  rdp: number;
  cam: number;
};

export function getSiteServicePorts(basePort: number): SiteServicePorts {
  if (basePort === 0) {
    return {
      nvr: 80,
      rtsp: 554,
      ftp: 21,
      ssh: 22,
      rdp: 3389,
      cam: 5000,
    };
  }

  const base = Math.floor(basePort / 10) * 10;
  return {
    nvr: base + 1,
    rtsp: base + 3,
    ftp: base + 4,
    ssh: base + 5,
    rdp: base + 6,
    cam: base + 8,
  };
}

export function isValidSiteBasePort(basePort: number) {
  if (!Number.isInteger(basePort) || basePort < 0 || basePort > MAX_SITE_BASE_PORT) return false;
  const ports = Object.values(getSiteServicePorts(basePort));
  return ports.every((port) => Number.isInteger(port) && port >= 1 && port <= MAX_TCP_PORT);
}

export function getRdpPort(basePort: number) {
  return getSiteServicePorts(basePort).rdp;
}

function parseIpv4(value: string) {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;

  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    const octet = Number.parseInt(part, 10);
    return octet >= 0 && octet <= 255 ? octet : Number.NaN;
  });
  return octets.every(Number.isInteger) ? octets : undefined;
}

export function isValidIpv4Address(value: string) {
  return Boolean(parseIpv4(value));
}

export function isPrivateIpv4Address(value: string) {
  const octets = parseIpv4(value);
  if (!octets) return false;

  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function isValidPrivateIpv4Cidr(value: string) {
  const [address, prefixText, ...rest] = value.split('/');
  if (rest.length > 0 || !isPrivateIpv4Address(address)) return false;
  if (!/^\d{1,2}$/.test(prefixText || '')) return false;

  const prefix = Number.parseInt(prefixText, 10);
  if (prefix < 8 || prefix > 32) return false;
  const octets = parseIpv4(address);
  if (!octets) return false;
  const value32 = octets.reduce((acc, octet) => ((acc << 8) | octet) >>> 0, 0);
  const hostBits = 32 - prefix;
  const hostMask = hostBits === 32 ? 0xffffffff : (2 ** hostBits) - 1;
  return (value32 & hostMask) === 0;
}

export function isIpv4InCidr(ipv4: string, cidr: string) {
  if (!isValidIpv4Address(ipv4) || !isValidPrivateIpv4Cidr(cidr)) return false;
  const [networkAddress, prefixText] = cidr.split('/');
  const ipValue = parseIpv4(ipv4)!.reduce((acc, octet) => ((acc << 8) | octet) >>> 0, 0);
  const networkValue = parseIpv4(networkAddress)!.reduce((acc, octet) => ((acc << 8) | octet) >>> 0, 0);
  const prefix = Number.parseInt(prefixText, 10);
  const hostBits = 32 - prefix;
  const hostMask = hostBits === 32 ? 0xffffffff : (2 ** hostBits) - 1;
  return (ipValue & ~hostMask) === (networkValue & ~hostMask);
}

function require4Via6SiteId(siteId: string | number) {
  const parsed = typeof siteId === 'number' ? siteId : Number.parseInt(siteId, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535 || String(parsed) !== String(siteId)) {
    throw new Error('4via6 현장 ID는 0부터 65535 사이의 정수여야 합니다.');
  }
  return parsed;
}

export function get4Via6Address(siteId: string | number, ipv4: string) {
  const numericSiteId = require4Via6SiteId(siteId);
  const octets = parseIpv4(ipv4);
  if (!octets || !isPrivateIpv4Address(ipv4)) {
    throw new Error('4via6 대상은 사설 IPv4 주소여야 합니다.');
  }

  const upper = ((octets[0] << 8) | octets[1]).toString(16);
  const lower = ((octets[2] << 8) | octets[3]).toString(16);
  return `fd7a:115c:a1e0:b1a:0:${numericSiteId.toString(16)}:${upper}:${lower}`;
}

export function get4Via6Route(siteId: string | number, cidr: string) {
  if (!isValidPrivateIpv4Cidr(cidr)) {
    throw new Error('4via6 LAN 대역은 네트워크 주소로 정렬된 사설 IPv4 CIDR이어야 합니다.');
  }

  const [address, prefixText] = cidr.split('/');
  return `${get4Via6Address(siteId, address)}/${96 + Number.parseInt(prefixText, 10)}`;
}
export type { DeletePreview, DeleteProgress, DeleteResult } from './ftp-delete.cjs';
