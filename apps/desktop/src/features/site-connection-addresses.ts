import { get4Via6Address, isValidIpv4Address, type Site, type SiteAgentStatus } from '@fieldlink/shared';

export function getPcTailscaleAddress(status?: SiteAgentStatus) {
  const address = status?.tunnelIpv4?.trim();
  return address && isValidIpv4Address(address) ? address : null;
}

function getDeviceAddress(site: Site, localIp?: string) {
  if (!localIp?.trim()) return null;
  try {
    // 기존 원격 접속과 같은 현장 ID·내부 IP 조합을 쓰고 누락 주소는 추정하지 않는다.
    return get4Via6Address(site.id, localIp.trim());
  } catch {
    return null;
  }
}

export function getSiteConnectionAddresses(site: Site, status?: SiteAgentStatus) {
  return [
    { key: 'pc', label: 'PC', kind: 'Tailscale IPv4', address: getPcTailscaleAddress(status) },
    { key: 'nvr', label: '녹화기', kind: '4via6', address: getDeviceAddress(site, site.nvrLocalIp) },
    { key: 'camera', label: '카메라', kind: '4via6', address: getDeviceAddress(site, site.cameraLocalIp) },
  ];
}
