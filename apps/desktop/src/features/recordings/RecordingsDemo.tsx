import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, ChevronRight, X, Search } from 'lucide-react';
import { DEMO_DATE, demoRecordings, stateLabels, type Recording, type TransferState } from './demo-data';
import './recordings.css';
import { DatePicker } from '../../components/DatePicker';
import { RecordingFilterMenu } from './RecordingFilterMenu';

export function RecordingsDemo({ recordings = demoRecordings, initialDate = DEMO_DATE, onRangeChange, onOpenFolder }: {
  recordings?: Recording[]; initialDate?: string; onRangeChange?: (from: string, to: string) => void;
  onOpenFolder?: (recording: Recording) => void;
} = {}) {
  const live = Boolean(onRangeChange);
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);
  const [academy, setAcademy] = useState('');
  const [room, setRoom] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TransferState | ''>('');
  const [mode, setMode] = useState<'local' | 'cloud'>('cloud');
  const modeChosen = useRef(false);
  const [selection, setSelected] = useState<Recording>();
  const selected = selection && (recordings.find(item => item.id === selection.id) || selection);
  useEffect(() => { onRangeChange?.(from, to); }, [from, to, onRangeChange]);
  useEffect(() => {
    if (modeChosen.current || !recordings.some(row => row.mode === 'cloud' || row.mode === 'local')) return;
    setMode(recordings.some(row => row.mode === 'cloud') ? 'cloud' : 'local');
    modeChosen.current = true;
  }, [recordings]);
  const modeRows = useMemo(() => recordings.filter(r => (r.mode || 'unknown') === mode), [recordings, mode]);
  const scoped = useMemo(() => modeRows.filter((r) => r.date >= from && r.date <= to
    && (!academy || r.academy === academy) && (!room || r.room === room)
    && `${r.account} ${r.course} ${r.title} ${r.filename}`.toLowerCase().includes(query.toLowerCase().trim())), [modeRows, from, to, academy, room, query]);
  const rows = scoped.filter((r) => !filter || r.state === filter);
  const groups = [...new Set(rows.map((r) => `${r.date}|${r.academy}|${r.room}`))];
  const filterOptions = recordings.filter(r => r.mode === mode || (r.mode || 'unknown') === 'unknown');
  const rooms = [...new Set(filterOptions.filter((r) => !academy || r.academy === academy).map((r) => r.room))];
  const statuses: (TransferState | '')[] = mode === 'local' ? ['', 'recording', 'saving', 'save_failed', 'saved']
    : ['', 'recording', 'sending', 'failed', 'complete'];
  const unclassified = recordings.filter(r => (r.mode || 'unknown') === 'unknown' && r.date >= from && r.date <= to
    && (!academy || r.academy === academy) && (!room || r.room === room)
    && `${r.account} ${r.course} ${r.title} ${r.filename}`.toLowerCase().includes(query.toLowerCase().trim()));
  const open = (r: Recording) => setSelected(r);
  return <section className="recordings-demo" aria-label={live ? '녹화·전송' : '녹화·전송 데모'}>
    <div className="rec-mode-tabs" role="tablist" aria-label="녹화 유형">
      {(['local', 'cloud'] as const).map(next => <button key={next} type="button" role="tab" aria-selected={mode === next}
        onClick={() => { modeChosen.current = true; setMode(next); setAcademy(''); setRoom(''); setFilter(''); }}>
        {next === 'local' ? '로컬' : '클라우드러닝'}<span>{recordings.filter(row => (row.mode || 'unknown') === next).length}</span>
      </button>)}
    </div>
    <div className="rec-filters">
      <label>시작일<DatePicker label="시작일" value={from} onChange={setFrom} /></label>
      <label>종료일<DatePicker label="종료일" value={to} onChange={setTo} /></label>
      <RecordingFilterMenu label="학원" value={academy} onChange={next => { setAcademy(next); setRoom(''); }} options={[{ value: '', label: '전체 학원' }, ...[...new Set(filterOptions.map(r => r.academy))].map(name => ({ value: name, label: name }))]} />
      <RecordingFilterMenu label="강의실" value={room} onChange={setRoom} options={[{ value: '', label: '전체 강의실' }, ...rooms.map(name => ({ value: name, label: name }))]} />
      <label className="rec-search">계정·강좌·제목 검색<div><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="계정, 강좌, 제목 또는 파일명" /></div></label>
    </div>
    <div className="rec-status-filters" aria-label="상태 필터">{statuses.map((s) => <button key={s} type="button" aria-pressed={filter === s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>{s ? stateLabels[s] : '전체'} <b>{scoped.filter((r) => !s || r.state === s).length}</b></button>)}</div>
    <p className="rec-help">{mode === 'local' ? '녹화 종료 후 녹화기의 MP4 파일 존재와 크기를 확인합니다.' : '전송 완료는 녹화기 FTP 전송 완료이며 CMS 재생 준비와는 별개입니다.'}</p>
    {from > to ? <div className="rec-empty" role="alert">종료일을 시작일 이후로 선택해 주세요.</div> : groups.length === 0 && unclassified.length === 0 ? <div className="rec-empty">조건에 맞는 녹화가 없습니다.{live && <p>에이전트 수집 시작 이후의 새 녹화만 표시됩니다.</p>}<button type="button" onClick={() => { setFrom(initialDate); setTo(initialDate); setAcademy(''); setRoom(''); setQuery(''); setFilter(''); }}>필터 초기화</button></div> : groups.map((key) => {
      const [date, a, r] = key.split('|'); const records = rows.filter((v) => v.date === date && v.academy === a && v.room === r);
      return <section className="rec-group" key={key} aria-label={`${date} ${a} ${r}`}><header><h2>{a} <ChevronRight size={14}/> {r}</h2><span>{date} <b>{records.length}건</b></span></header><div className="rec-table-scroll"><table><thead><tr><th>녹화 계정</th><th>강좌 / 녹화 제목</th><th>시작</th><th>종료</th><th>{mode === 'local' ? '저장 상태' : mode === 'cloud' ? '업로드 상태' : '상태'}</th><th>작업</th></tr></thead><tbody>{records.map((v) => <tr key={v.id} className={v.state === 'recording' ? 'rec-live-row' : ''}><td><span className="rec-account">{v.account}</span><small>{v.account === '비로그인' ? '로컬 녹화' : v.account === '확인 불가' ? '계정 미확인' : '로그인 녹화'}</small></td><td><b>{v.title}</b><small>{v.course}</small></td><td className="rec-time">{v.start}</td><td className="rec-time">{v.end || (v.state === 'recording' ? <span className="rec-badge recording">녹화 중</span> : '확인 불가')}</td><td><span className={`rec-badge ${v.state}`}>{v.state === 'recording' ? '녹화 종료 후 확인' : stateLabels[v.state]}</span>{(v.state === 'failed' || v.state === 'save_failed') && <small className="rec-error">{mode === 'local' ? '파일 저장을 확인하지 못했습니다.' : '실패 당시 로그를 확인해 주세요.'}</small>}</td><td><div className="rec-row-actions"><button type="button" disabled={!v.folder || !onOpenFolder} aria-label={`${v.title} 영상 폴더`} onClick={() => onOpenFolder?.(v)}><FolderOpen size={14}/>영상 폴더</button><button type="button" aria-label={`${v.title} 상세`} onClick={() => open(v)}>상세<ChevronRight size={14}/></button></div></td></tr>)}</tbody></table></div></section>;
    })}
    {unclassified.length > 0 && <section className="rec-group" aria-label="유형 미지정 녹화"><header><h2>유형 미지정 녹화</h2><span>{unclassified.length}건</span></header><div className="rec-unclassified-list">{unclassified.map(row => <button type="button" key={row.id} onClick={() => open(row)}><span>{row.academy} › {row.room}</span><strong>{row.title}</strong><small>{row.date} {row.start}</small></button>)}</div></section>}
    {selected && <aside className="rec-detail" aria-label="녹화 상세"><header><div><small>{!live && '데모 · '}{selected.academy} / {selected.room}</small><h2>녹화 상세</h2></div><button type="button" aria-label="상세 닫기" onClick={() => setSelected(undefined)}><X size={16}/></button></header>
      <div className="rec-detail-body"><h3>{selected.title}</h3><p>{selected.course} · 녹화 계정 <b>{selected.account}</b></p>
      <dl><div><dt>녹화 날짜</dt><dd>{selected.date}</dd></div><div><dt>녹화 시작</dt><dd>{selected.start}</dd></div><div><dt>녹화 종료</dt><dd>{selected.end || '확인되지 않음'}</dd></div></dl><ol className="rec-timeline">{(recordings.find(item => item.id === selected.id) || selected).events.map((event, index) => <li key={`${event.time}-${index}`}><time>{event.time}</time><span>{event.text}</span></li>)}</ol><p className="rec-help">파일명</p><code className="rec-path">{selected.filename || '파일 경로 미확인'}</code>
      </div></aside>}
  </section>;
}
