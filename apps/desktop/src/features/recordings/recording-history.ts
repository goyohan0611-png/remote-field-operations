import type { Recording, TransferState } from './demo-data';

export type HistoryEvent = {
  site_id: number; session_id: string; academy: string; room: string; cloud_mode?: 'local' | 'cloud' | 'unknown';
  payload: { id: string; kind: string; at: string; account?: string; course?: string; title?: string; filePath?: string };
  agent_last_seen?: string;
};
export type LiveRecording = Recording & { siteId: string };
const labels: Record<string, string> = { recording: '녹화 시작 성공', metadata: '강좌·파일 정보 확인', stopped: '녹화 종료 성공', saved: 'MP4 파일 저장 확인', save_failed: 'MP4 파일 저장 확인 실패', waiting: '전송 대기 등록', sending: 'FTP 전송 시작', failed: 'FTP 전송 실패', complete: 'FTP 전송 완료 확인' };
const local = (at: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(at));
export const today = () => local(new Date().toISOString()).slice(0, 10);

export function mapHistory(events: HistoryEvent[]): LiveRecording[] {
  const rows = new Map<string, LiveRecording>();
  const seen = new Map<string, string | undefined>();
  const kindsByKey = new Map<string, string[]>();
  for (const event of events) {
    const key = `${event.site_id}:${event.session_id}`; const item = event.payload;
    kindsByKey.set(key, [...(kindsByKey.get(key) || []), item.kind]);
    seen.set(key, event.agent_last_seen);
    const at = local(item.at);
    let row = rows.get(key);
    if (!row) {
      row = { id: key, siteId: String(event.site_id), academy: event.academy, room: event.room, mode: event.cloud_mode || 'unknown',
        date: at.slice(0, 10), account: '확인 불가', course: '강좌 미확인', title: '제목 미확인', start: '확인 불가',
        state: 'unknown', filename: '', folder: '', size: '크기 미확인', events: [] };
      rows.set(key, row);
    }
    if (item.account) row.account = item.account;
    if (item.course) row.course = item.course;
    if (item.title) row.title = item.title;
    if (item.filePath) { row.filename = item.filePath.split('/').at(-1)!; row.folder = item.filePath.slice(0, item.filePath.lastIndexOf('/')) || '/'; }
    if (item.kind === 'recording') { row.start = at.slice(11); row.state = 'recording'; }
    else if (item.kind === 'stopped') { row.end = at.slice(11); row.state = row.account === '비로그인' ? 'local' : 'unknown'; }
    else if (['waiting', 'sending', 'failed', 'complete', 'saved', 'save_failed'].includes(item.kind)) row.state = item.kind as TransferState;
    if (row.mode !== 'local' || !['waiting', 'sending', 'failed', 'complete'].includes(item.kind)) {
      const label = item.kind === 'metadata'
        ? item.filePath ? '녹화 파일 경로 확인' : item.course || item.title ? '강좌 정보 확인' : labels.metadata
        : labels[item.kind] || '상태 확인';
      row.events.push({ time: at.slice(11), text: label });
    }
  }
  for (const row of rows.values()) {
    const kinds = kindsByKey.get(row.id) || [];
    if (row.mode === 'local') {
      row.state = kinds.includes('saved') ? 'saved' : kinds.includes('save_failed') ? 'save_failed'
        : kinds.includes('stopped') ? row.filename ? 'saving' : 'unknown' : 'recording';
    } else if (row.mode === 'cloud') {
      row.state = kinds.includes('complete') ? 'complete' : kinds.includes('failed') ? 'failed'
        : kinds.includes('sending') ? 'sending' : kinds.includes('waiting') ? 'waiting'
          : kinds.includes('stopped') ? 'unknown' : 'recording';
    }
    const latest = seen.get(row.id);
    if (row.state === 'recording' && (!latest || Date.now() - Date.parse(latest) > 120000)) row.state = 'unknown';
  }
  return [...rows.values()];
}
