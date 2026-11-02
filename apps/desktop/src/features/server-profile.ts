import axios from 'axios';

export function supportsServerEdition(profile: { edition?: unknown; supportedEditions?: unknown }, edition: string) {
  return profile.edition === edition || (Array.isArray(profile.supportedEditions) && profile.supportedEditions.includes(edition));
}

export function installServerEditionGuard(apiUrl: string, edition: string) {
  if (edition !== 'tunnel-preview') return;
  const probe = axios.create({ timeout: 10_000 });
  let expiresAt = 0;
  let pending: Promise<void> | undefined;
  axios.interceptors.request.use(async (request) => {
    if (!request.url?.startsWith(`${apiUrl}/`)) return request;
    if (Date.now() >= expiresAt) {
      pending ??= probe.get(`${apiUrl}/api/product-profile`).then(({ data }) => {
        if (!supportsServerEdition(data, edition)) throw new Error('Tailscale을 지원하지 않는 서버입니다. 서버 업데이트를 확인하세요.');
        expiresAt = Date.now() + 60_000;
      }).catch(() => {
        throw new Error('Tailscale 지원 서버를 확인하지 못했습니다. 서버 업데이트 또는 연결 상태를 확인하세요.');
      }).finally(() => { pending = undefined; });
      await pending;
    }
    return request;
  });
}
