import { createDemoStore } from '../../../server/src/demo-store.mjs';
export const store = createDemoStore();
export const serverMode = new URLSearchParams(window.location.search).get('transport') === 'server';

export async function request(method: string, path: string, body: Record<string, unknown> = {}) {
  if (!path.startsWith('/api/') || path.includes('://') || path.includes('\\')) throw new Error('데모 API 경로만 사용할 수 있습니다.');
  if (!serverMode) return store.handle(method, path, body);
  // 선택적 통합 시험도 고정된 루프백 서버만 사용한다. 외부 주소는 입력받지 않는다.
  const response = await fetch(`http://127.0.0.1:4177${path}`, {
    method, signal: AbortSignal.timeout(10000), credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '로컬 데모 서버 요청 실패');
  return data;
}
