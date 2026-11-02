import { store, request, serverMode } from './transport';
// Socket.IO의 UI 구독 계약만 유지한다. 소켓이나 외부 연결을 만들지 않는다.
export function io(..._args: unknown[]) {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const unsubscribe = store.subscribe((event: string, payload: unknown) => { for (const callback of handlers.get(event) || []) callback(payload); });
  let pending = false;
  let active = true;
  // 로컬 통합 모드에서는 실제 Socket.IO 대신 짧은 상태 조회로 화면을 갱신한다.
  const timer = serverMode ? window.setInterval(async () => {
    if (pending) return;
    pending = true;
    try {
      const snapshot = await request('GET', '/api/dashboard');
      if (active) for (const callback of handlers.get('dashboard:snapshot') || []) callback(snapshot);
    } catch {
      if (active) for (const callback of handlers.get('connect_error') || []) callback();
    } finally { pending = false; }
  }, 3000) : undefined;
  const socket = {
    on(event: string, callback: (...args: any[]) => void) { const callbacks = handlers.get(event) || new Set(); callbacks.add(callback); handlers.set(event, callbacks); return socket; },
    off(event: string, callback: (...args: any[]) => void) { handlers.get(event)?.delete(callback); return socket; },
    disconnect() { active = false; window.clearInterval(timer); unsubscribe(); handlers.clear(); },
  };
  return socket;
}
