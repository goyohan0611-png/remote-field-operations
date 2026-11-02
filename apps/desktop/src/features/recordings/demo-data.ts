export type TransferState = 'recording' | 'saving' | 'saved' | 'save_failed' | 'waiting' | 'sending' | 'complete' | 'failed' | 'local' | 'unknown';
export type Recording = {
  id: string; date: string; academy: string; room: string; account: string;
  course: string; title: string; start: string; end?: string; state: TransferState;
  mode?: 'local' | 'cloud' | 'unknown';
  filename: string; folder: string; size: string; events: { time: string; text: string }[];
};
export const DEMO_DATE = '2026-09-28';
export const stateLabels: Record<TransferState, string> = {
  recording: '녹화 중', saving: '저장 확인 중', saved: '저장 완료', save_failed: '저장 확인 실패', waiting: '전송 대기', sending: '전송 중', complete: '전송 완료',
  failed: '전송 실패', local: '전송 대상 아님', unknown: '확인 불가',
};
// 실제 학원이나 계정 정보가 아닌 화면 검토용 데이터다. 네트워크 요청에는 사용하지 않는다.
export const demoRecordings: Recording[] = [
  ['r1', DEMO_DATE, '가온학원', '1강의실', 'math01', '수학Ⅰ', '지수함수의 그래프', '14:00:12', '14:48:35', 'complete'],
  ['r2', DEMO_DATE, '가온학원', '1강의실', 'english02', '영어 독해', '문장의 구조와 해석', '15:00:05', '15:42:10', 'failed'],
  ['r3', DEMO_DATE, '가온학원', '1강의실', 'math01', '수학Ⅱ', '미분의 첫걸음', '16:00:20', '', 'recording'],
  ['r4', DEMO_DATE, '가온학원', '2강의실', 'science03', '통합과학', '물질의 규칙성', '15:00:00', '15:52:18', 'sending'],
  ['r5', DEMO_DATE, '가온학원', '2강의실', '비로그인', '로컬 녹화', '20260928_140005', '14:00:05', '14:35:20', 'saved'],
  ['r6', DEMO_DATE, '나래학원', '대강의실', 'korean01', '국어 문학', '현대시 읽기', '15:10:00', '15:55:12', 'waiting'],
  ['r7', DEMO_DATE, '나래학원', '대강의실', '확인 불가', '확인 불가', '20260928_130000', '13:00:00', '', 'unknown'],
  ['r8', '2026-09-27', '가온학원', '1강의실', 'math01', '수학Ⅰ', '지수와 로그 복습', '14:00:00', '14:45:00', 'complete'],
].map(([id, date, academy, room, account, course, title, start, end, rawState]) => {
  const state = rawState as TransferState;
  const filename = `${date.replaceAll('-', '')}_${start.replaceAll(':', '')}_${id}_CH1.mp4`;
  const events = [{ time: start, text: '녹화 시작 성공' }];
  if (end) events.push({ time: end, text: '녹화 종료 성공' });
  if (state === 'complete') events.push({ time: '14:50:08', text: 'FTP 전송 완료 · 전송 목록에서 작업 제거 확인' });
  if (state === 'failed') events.push({ time: '15:44:18', text: '전송 실패 · 서버 응답 시간 초과 (127초)' });
  if (state === 'sending') events.push({ time: '15:52:24', text: 'FTP 전송 시작 · 진행률은 제공되지 않음' });
  if (state === 'waiting') events.push({ time: '15:55:13', text: '전송 대기 목록 등록' });
  if (state === 'saved') events.push({ time: end, text: 'MP4 파일 저장 확인' });
  if (state === 'unknown') events.push({ time: '13:02:00', text: '상태 수신 중단 · 종료 여부 확인 필요' });
  return { id, date, academy, room, account, course, title, start, end: end || undefined, state, mode: account === '비로그인' ? 'local' : 'cloud', filename,
    folder: `/demo/${account === '비로그인' ? 'LOCAL' : account}/${course.replaceAll(' ', '_')}`,
    size: state === 'recording' || state === 'unknown' ? '확인 중' : '428 MB', events };
});
