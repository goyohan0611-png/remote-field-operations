import { useEffect, useState } from 'react';
import axios from 'axios';
import { RecordingsDemo } from './RecordingsDemo';
import { mapHistory, today, type HistoryEvent, type LiveRecording } from './recording-history';

export function RecordingHistory({ apiUrl, onOpenFolder }: {
  apiUrl: string; onOpenFolder: (siteId: string, folder: string) => void;
}) {
  const [range, setRange] = useState({ from: today(), to: today() });
  const [rows, setRows] = useState<LiveRecording[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    setRows([]); setLoading(true);
    async function load() {
      try {
        if (range.from > range.to) { setError('종료일을 시작일 이후로 선택해 주세요.'); return; }
        const response = await axios.get<{ events: HistoryEvent[]; truncated: boolean }>(`${apiUrl}/api/recording-history`, { params: range, signal: controller.signal, timeout: 10000 });
        if (!controller.signal.aborted) { setRows(mapHistory(response.data.events)); setTruncated(response.data.truncated); setError(''); }
      } catch {
        if (!controller.signal.aborted) setError('녹화 이력을 가져오지 못했습니다. 서버 연결과 업데이트 여부를 확인해 주세요. 조회 기간은 최대 31일입니다.');
      } finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(() => { void load(); }, 3000); }
      }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [apiUrl, range]);
  return <>
    {loading && <p role="status">실제 녹화 이력을 불러오는 중입니다.</p>}
    {error && <p role="alert">{error}</p>}
    {truncated && <p role="status">최근 1,000건을 표시하고 있습니다. 이전 기록은 날짜 범위를 줄여 조회해 주세요.</p>}
    <RecordingsDemo recordings={rows} initialDate={range.from} onRangeChange={(from, to) => setRange(current => current.from === from && current.to === to ? current : { from, to })}
      onOpenFolder={row => { const live = rows.find(item => item.id === row.id); if (live?.folder) onOpenFolder(live.siteId, live.folder); }}
      />
  </>;
}
