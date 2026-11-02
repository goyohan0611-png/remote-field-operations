import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useModalBackdrop } from '../../components/AppDialog';
import './agent-logs.css';

type LogJob = { id: string; kind: 'program' | 'recorder'; log_date: string; status: string; byte_count: number; manifest: string[] | null; error: string | null };
const labels: Record<string, string> = { queued: '에이전트 확인 대기', collecting: '전체 로그 수집 중', complete: '전체 수집 완료', failed: '수집 실패', expired: '요청 시간 초과' };
const errors: Record<string, string> = {
  file_missing: '선택 날짜의 로그 파일이 없습니다.',
  read_failed: '파일 읽기에 실패했습니다. 파일 권한·인코딩·분할 파일 형식을 확인하세요.',
  limit_exceeded: '20MB 또는 64개 파일 한도를 넘었습니다. 일부만 수집한 결과는 제공하지 않습니다.',
  ssh_failed: '녹화기 SSH 연결 또는 로그 읽기에 실패했습니다. 접속 설정과 호스트 키를 확인하세요.',
  source_changed: '수집 도중 파일 또는 에이전트 상태가 바뀌었습니다. 다시 요청하세요.',
  request_expired: '15분 안에 수집을 마치지 못했습니다. 에이전트 연결을 확인하고 다시 요청하세요.',
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function AgentLogDialog({ siteId, siteName, apiUrl, onClose }: { siteId: string; siteName: string; apiUrl: string; onClose: () => void }) {
  const [kind, setKind] = useState<'program' | 'recorder'>('program');
  const [date, setDate] = useState(today);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [job, setJob] = useState<LogJob | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(true);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(true);
  const backdrop = useModalBackdrop(onClose);
  const endpoint = `${apiUrl}/api/admin/agent-logs`;
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    axios.get<{ id: string | null }>(endpoint, { params: { siteId }, signal: controller.signal, timeout: 15000 }).then(({ data }) => {
      setRequestId(data.id); setSending(false);
    }).catch(() => { if (!controller.signal.aborted) { setError('최근 요청을 확인하지 못했습니다. 상태 다시 확인을 눌러주세요.'); setSending(false); } });
    return () => { mounted.current = false; controller.abort(); };
  }, [endpoint, siteId, retry]);
  useEffect(() => {
    if (!requestId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const { data } = await axios.get<LogJob>(`${endpoint}/${requestId}`, { signal: controller.signal, timeout: 15000 });
        if (controller.signal.aborted) return;
        setJob(data); setContent(null); setError('');
        if (data.status === 'complete') {
          const response = await axios.get<string>(`${endpoint}/${requestId}/content`, { responseType: 'text', signal: controller.signal, timeout: 60000 });
          if (!controller.signal.aborted) setContent(response.data);
        } else if (data.status === 'queued' || data.status === 'collecting') {
          timer = setTimeout(() => { void poll(); }, 2000);
        }
      } catch {
        if (!controller.signal.aborted) setError('수집 상태를 확인하지 못했습니다. 상태 다시 확인을 눌러주세요.');
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [endpoint, requestId, retry]);

  async function request() {
    setSending(true); setError(''); setContent(null); setQuery('');
    try {
      const { data } = await axios.post<{ id: string }>(endpoint, { siteId, kind, date }, { timeout: 15000 });
      if (mounted.current) { setJob(null); setRequestId(data.id); }
    } catch {
      if (mounted.current) { setError('요청을 확인하지 못했습니다. 에이전트 업데이트·연결 상태 또는 진행 중인 요청을 확인하세요.'); setRetry((value) => value + 1); }
    } finally { if (mounted.current) setSending(false); }
  }
  const preview = useMemo(() => {
    const matches = (content || '').split('\n').filter((line) => !query || line.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return { count: matches.length, text: matches.slice(0, 2000).join('\n').slice(0, 200000) };
  }, [content, query]);
  const active = !!requestId && (!job || ['queued', 'collecting'].includes(job.status));
  function download() {
    if (content === null || job?.status !== 'complete') return;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${job.kind}-${job.log_date}-${siteId}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="modal-backdrop" {...backdrop}>
    <section className="log-dialog agent-log-dialog" role="dialog" aria-modal="true" aria-label={`${siteName} 현장 로그`}>
      <header className="memo-header"><div><h3>{siteName} 현장 로그</h3><p>에이전트 요청 · 관리자 전용</p></div><button className="memo-close" onClick={onClose} aria-label="닫기">×</button></header>
      <div className="agent-log-controls">
        <label>로그 종류<select value={kind} disabled={sending || active} onChange={(e) => setKind(e.target.value as 'program' | 'recorder')}><option value="program">Fieldlink 프로그램</option><option value="recorder">녹화기 syslog</option></select></label>
        <label>로그 날짜<input type="date" value={date} disabled={kind === 'recorder' || sending || active} onChange={(e) => setDate(e.target.value)} /></label>
        <button className="agent-log-primary" disabled={!date || sending || active} onClick={() => void request()}>전체 로그 요청</button>
      </div>
      <p className="agent-log-note">{kind === 'program' ? '선택 날짜의 기본·분할 로그 파일을 수집 시점까지 모두 가져옵니다.' : '녹화기에 현재 남아 있는 /data/syslog 전체를 가져옵니다. 과거 날짜의 삭제된 로그는 복원하지 않습니다.'}<br />비밀번호·토큰 등이 포함된 줄은 업로드 전에 제거합니다. 최대 20MB · 64개 파일 · 서버 보관 24시간</p>
      <div className="agent-log-status" role="status"><span>{job ? `${labels[job.status] || job.status} · ${job.kind === 'program' ? job.log_date : '녹화기 현재 로그'} · ${(job.byte_count / 1024).toFixed(1)}KB` : '최근 요청 확인 / 새 수집 대기'}</span><button disabled={sending} onClick={() => { setSending(true); setError(''); setRetry((value) => value + 1); }}>상태 다시 확인</button></div>
      {job?.manifest && <p className="agent-log-note">수집 파일: {job.manifest.join(', ')}</p>}
      {(error || job?.error) && <div className="memo-error" role="alert">{error || errors[job?.error || ''] || '수집에 실패했습니다. 연결을 확인하고 다시 요청하세요.'}</div>}
      {content !== null ? <><div className="log-search"><input aria-label="전체 로그 검색" placeholder="전체 로그에서 검색" value={query} onChange={(e) => setQuery(e.target.value)} /><button onClick={download}>전체 로그 저장</button></div><p className="agent-log-note">{preview.count}줄 · 화면은 최대 2,000줄 / 20만 자 미리보기, 저장은 수집한 전체 내용입니다.</p><pre className="log-content">{preview.text || '검색 결과가 없습니다.'}</pre></> : <div className="memo-empty">{active ? '창을 닫아도 수집은 계속됩니다. 다시 열면 최근 요청을 확인합니다.' : '날짜와 로그 종류를 선택하고 전체 로그를 요청하세요.'}</div>}
    </section>
  </div>;
}
