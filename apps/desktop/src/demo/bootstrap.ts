import axios, { AxiosError } from 'axios';
import { request, store } from './transport';
export { demoUser } from '../../../server/src/demo-store.mjs';

// 모든 axios 인스턴스에 적용해 실제 서버로 빠지는 요청을 없앤다.
axios.defaults.adapter = async config => {
  const url = new URL(config.url || '/', 'http://demo.invalid');
  if (url.origin !== 'http://demo.invalid') throw new Error('외부 서버 연결은 데모에서 차단됩니다.');
  for (const [key, value] of Object.entries(config.params || {})) url.searchParams.set(key, String(value));
  try {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const data = await request((config.method || 'get').toUpperCase(), url.pathname + url.search, body);
    return { config, data, status: 200, statusText: 'OK', headers: {} };
  } catch (error) {
    throw new AxiosError(error instanceof Error ? error.message : '데모 요청 실패', 'DEMO_ONLY', config, undefined,
      { config, data: { error: error instanceof Error ? error.message : 'demo_only' }, status: 403, statusText: 'Demo only', headers: {} });
  }
};

const denied = async () => { throw new Error('데모 화면입니다. 실제 장비 접속·파일 변경·설치는 실행하지 않습니다.'); };
const noop = async () => undefined;
const subscribe = () => () => undefined;
// Electron 브리지를 가져오지 않고 허용한 조회 응답만 제공한다.
const desktop = {
  getAppInfo: async () => ({ version: '1.0.0', flavor: 'tunnel-preview', displayName: 'Fieldlink DEMO', status: 'latest', availableVersion: null, downloadPercent: null }),
  getTunnelClientStatus: async () => 'online',
  setAuthToken: noop, setWindowAuthenticated: noop, observeAgentStatuses: () => undefined, disconnectAgentStatuses: () => undefined,
  onAppUpdateStatus: subscribe, onDownloadProgress: subscribe, onUploadCompleted: subscribe, onPcTransferProgress: subscribe,
  onFileDeleteProgress: subscribe, onPcFileDeleteProgress: subscribe, onSshData: subscribe, onSshReady: subscribe, onSshError: subscribe, onSshClose: subscribe,
  minimizeWindow: noop, toggleMaximizeWindow: noop, closeWindow: noop,
  listFiles: async ({ path = '/' }: { path?: string }) => store.files(path),
  listPcFiles: async ({ path = '' }: { path?: string }) => ({ path, nextOffset: null, items: path ? [
    { name: '샘플 강의.mp4', path: `${path.replace(/\\$/, '')}\\샘플 강의.mp4`, isDirectory: false, size: 448790528, modifiedAt: new Date().toISOString() },
  ] : [{ name: '데모 드라이브', path: 'D:\\', isDirectory: true, size: 0, modifiedAt: null }] }),
  getSyslog: async () => ({ log: '[DEMO] recorder ready\n[DEMO] health check complete\n[DEMO] recording saved' }),
  getNvrAudioLevels: async () => ({ levels: [] }),
};
window.kioskDesktop = new Proxy(desktop, {
  get(target, name: string) { if (name in target) return target[name as keyof typeof target]; if (name.startsWith('on')) return subscribe; return denied; },
}) as unknown as NonNullable<typeof window.kioskDesktop>;
