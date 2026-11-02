import axios from 'axios';
import { get4Via6Route, getSiteName, type Site } from '@fieldlink/shared';

export type SetupTarget = Pick<Site, 'id' | 'academyName' | 'building' | 'room'>;
export type SetupInvitation = {
  code: string;
  expiresAt: string;
  siteId: number;
  academy: string;
  room: string;
  tailnetName: string;
  route: string;
};

export function setupServerUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function setupTargetLabels(target: SetupTarget) {
  return { academy: target.academyName.trim(), room: getSiteName(target).trim() };
}

export function parseSetupInvitation(value: unknown, target: SetupTarget): SetupInvitation {
  if (!value || typeof value !== 'object') throw new Error('invalid_setup_response');
  const row = value as Record<string, unknown>;
  const labels = setupTargetLabels(target);
  if (row.version !== 1 || typeof row.code !== 'string' || !/^(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/.test(row.code)
      || typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt))
      || typeof row.siteId !== 'number' || !Number.isInteger(row.siteId) || row.siteId < 1 || row.siteId > 65535
      || row.academy !== labels.academy || row.room !== labels.room || row.tag !== 'tag:fieldlink'
      || row.subnet !== '192.168.1.0/24' || row.route !== get4Via6Route(row.siteId, '192.168.1.0/24')
      || typeof row.tailnetName !== 'string' || !row.tailnetName.trim()) throw new Error('invalid_setup_response');
  // 등록키/세션 토큰 등 불필요한 응답 필드는 화면 상태에 보관하지 않는다.
  return { code: row.code, expiresAt: row.expiresAt, siteId: row.siteId, academy: labels.academy,
    room: labels.room, tailnetName: row.tailnetName, route: row.route as string };
}

export function setupIssueError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const code = error.response?.data?.error;
    if (status === 503 && code === 'setup_not_configured') return '서버의 회사 Tailscale 설정이 준비되지 않았습니다. 관리자에게 회사 인증 설정을 요청하세요.';
    if (status === 401) return '로그인이 만료되었거나 서버 업데이트가 필요합니다. OPS에 다시 로그인하고 서버 버전을 확인하세요.';
    if (status === 403) return '코드 발급은 OPS 관리자만 사용할 수 있습니다.';
    if (status === 404) return '서버에 Tailscale 전용 발급 기능이 없습니다. 서버를 업데이트해 주세요.';
    if (status === 429) return '발급 요청이 많습니다. 잠시 후 다시 시도하세요.';
    if (code === 'setup_site_ids_exhausted') return '설치 번호를 더 발급할 수 없습니다. 관리자에게 번호 예약 현황 확인을 요청하세요.';
    if (code === 'setup_https_required') return 'HTTPS 서버 연결을 확인하세요. 서버 프록시 설정이 필요할 수 있습니다.';
  }
  return '발급 결과를 확인하지 못했습니다. 이전 코드는 사용하지 말고 연결 상태를 확인한 뒤 다시 발급해 주세요.';
}
