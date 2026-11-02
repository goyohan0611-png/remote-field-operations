import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { DeletePreview, DeleteProgress, DeleteResult, SiteConnectionContext } from '@fieldlink/shared';

export type DeleteTarget = { path: string; name: string; isDirectory: boolean };

export function validDeletePreview(value: DeletePreview, target: DeleteTarget): boolean {
  return value?.path === target.path && value.isDirectory === target.isDirectory
    && /^[a-fA-F0-9]{64}$/.test(value.fingerprint)
    && Number.isSafeInteger(value.files) && value.files >= 0
    && Number.isSafeInteger(value.directories) && value.directories >= 0
    && value.files + value.directories >= 1 && value.files + value.directories <= 10_000
    && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= 50 * 1024 * 1024 * 1024;
}

export async function readBrowserDeleteStream(response: Response, onProgress: (value: DeleteProgress) => void): Promise<DeleteResult> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(error.error === 'invalid_delete_password' ? '삭제 비밀번호가 맞지 않습니다.'
      : error.error === 'file_delete_disabled' ? '서버 삭제 비밀번호 설정이 없어 삭제할 수 없습니다.' : error.error || `삭제 요청 실패 (${response.status})`);
  }
  if (!response.headers.get('content-type')?.includes('application/x-ndjson') || !response.body)
    throw new Error('서버가 안전한 삭제 응답을 지원하지 않습니다. 서버 업데이트를 확인하세요.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '', result: DeleteResult | undefined;
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      while (pending.includes('\n')) {
        const index = pending.indexOf('\n');
        if (index > 16_384) throw new Error('삭제 응답이 올바르지 않습니다.');
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        if (!line.trim()) continue;
        const update = JSON.parse(line) as DeleteResult;
        if (!Number.isSafeInteger(update.deleted) || !Number.isSafeInteger(update.total)
          || update.deleted < 0 || update.deleted > update.total || update.total > 10_000 || result
          || (update.error !== undefined && typeof update.error !== 'string'))
          throw new Error('삭제 진행 응답이 올바르지 않습니다.');
        onProgress(update);
        if (['completed', 'canceled', 'failed'].includes(update.status)) result = update;
      }
      if (pending.length > 16_384) throw new Error('삭제 응답이 올바르지 않습니다.');
      if (done) break;
    }
    if (!result || pending.trim() || (result.status === 'completed' && result.deleted !== result.total))
      throw new Error('삭제 완료 결과를 받지 못했습니다.');
    return result;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export function useFileDeletion({ source, site, apiUrl = '', refresh }: {
  source: 'pc' | 'recorder'; site: SiteConnectionContext; apiUrl?: string; refresh: () => Promise<unknown>;
}) {
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [phase, setPhase] = useState<'checking' | 'confirm' | 'deleting' | 'done'>('checking');
  const [progress, setProgress] = useState<DeleteProgress>({ deleted: 0, total: 0 });
  const [result, setResult] = useState<DeleteResult | null>(null);
  const [error, setError] = useState('');
  const [stopping, setStopping] = useState(false);
  const operation = useRef<{ id: string; controller: AbortController } | null>(null);
  const mounted = useRef(true);
  const lastProgressRef = useRef<DeleteProgress>({ deleted: 0, total: 0 });
  const active = target !== null && (phase === 'checking' || phase === 'deleting');

  function cancelOperation() {
    const current = operation.current;
    if (!current) return;
    current.controller.abort();
    const cancel = source === 'pc' ? window.kioskDesktop?.cancelPcFileDelete : window.kioskDesktop?.cancelFileDelete;
    void cancel?.(current.id).catch(() => undefined);
  }

  useEffect(() => {
    mounted.current = true;
    const subscribe = source === 'pc' ? window.kioskDesktop?.onPcFileDeleteProgress : window.kioskDesktop?.onFileDeleteProgress;
    const unsubscribe = subscribe?.(next => { if (operation.current?.id === next.id) { lastProgressRef.current = { deleted: next.deleted, total: next.total }; setProgress(next); } });
    return () => { mounted.current = false; cancelOperation(); unsubscribe?.(); };
    // 현장별 대화상자는 다시 생성되며 진행 이벤트는 해당 작업 번호만 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id, source]);

  async function begin(next: DeleteTarget) {
    if (operation.current) return;
    const current = { id: crypto.randomUUID(), controller: new AbortController() };
    operation.current = current;
    setTarget(next); setPreview(null); setPhase('checking'); setError(''); setResult(null); setStopping(false);
    setProgress({ deleted: 0, total: 0 });
    try {
      let value: DeletePreview;
      if (source === 'pc') {
        if (!window.kioskDesktop?.previewPcFileDelete) throw new Error('모니터링 앱을 업데이트해야 삭제 사전 검사를 사용할 수 있습니다.');
        value = await window.kioskDesktop.previewPcFileDelete({ id: current.id, site, path: next.path, isDirectory: next.isDirectory });
      } else if (window.kioskDesktop) {
        if (!window.kioskDesktop.previewFileDelete) throw new Error('모니터링 앱을 업데이트해야 삭제 사전 검사를 사용할 수 있습니다.');
        value = await window.kioskDesktop.previewFileDelete({ id: current.id, site, path: next.path, isDirectory: next.isDirectory });
      } else {
        value = (await axios.get<DeletePreview>(`${apiUrl}/api/sites/${site.id}/files/delete-plan`, {
          params: { path: next.path, isDirectory: next.isDirectory }, signal: current.controller.signal, timeout: 65_000,
        })).data;
      }
      if (current.controller.signal.aborted) throw new Error('삭제 범위 검사를 중단했습니다.');
      if (!validDeletePreview(value, next)) throw new Error('삭제 범위 확인 결과가 올바르지 않습니다. 업데이트 후 다시 확인하세요.');
      if (mounted.current) { setPreview(value); setProgress({ deleted: 0, total: value.files + value.directories }); setPhase('confirm'); }
    } catch (caught) {
      if (mounted.current) {
        setError(current.controller.signal.aborted ? '삭제 범위 검사를 중단했습니다. 삭제는 시작하지 않았습니다.'
          : axios.isAxiosError(caught) && typeof caught.response?.data?.error === 'string' ? caught.response.data.error
          : caught instanceof Error ? caught.message : '삭제 범위를 확인하지 못했습니다.'); setPhase('done');
      }
    } finally { if (operation.current === current) operation.current = null; }
  }

  async function confirm(password: string) {
    if (!target || !preview || phase !== 'confirm' || operation.current) return;
    const current = { id: crypto.randomUUID(), controller: new AbortController() };
    operation.current = current; setPhase('deleting'); setError(''); setStopping(false);
    lastProgressRef.current = { deleted: 0, total: preview.files + preview.directories };
    const timer = setTimeout(() => { current.controller.abort(); cancelOperation(); }, 600_000);
    try {
      let value: DeleteResult;
      if (source === 'pc') {
        value = await window.kioskDesktop!.deletePcFile({ id: current.id, site, preview });
      } else if (window.kioskDesktop) {
        value = await window.kioskDesktop.deleteFile({ id: current.id, site, preview, password });
      } else {
        const response = await fetch(`${apiUrl}/api/sites/${site.id}/files`, {
          method: 'DELETE', signal: current.controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: String(axios.defaults.headers.common.Authorization || ''),
            'X-Kiosk-Edition': String(axios.defaults.headers.common['X-Kiosk-Edition'] || 'stable') },
          body: JSON.stringify({ preview, password }),
        });
        value = await readBrowserDeleteStream(response, update => { lastProgressRef.current = { deleted: update.deleted, total: update.total }; if (mounted.current) setProgress(update); });
      }
      if (!['completed', 'canceled', 'failed'].includes(value?.status) || value.total !== preview.files + preview.directories
        || !Number.isSafeInteger(value.deleted) || value.deleted < 0 || value.deleted > value.total
        || (value.status === 'completed' && value.deleted !== value.total)
        || (value.error !== undefined && typeof value.error !== 'string')) throw new Error('삭제 결과 응답이 올바르지 않습니다.');
      if (mounted.current) setResult(value);
    } catch (caught) {
      if (mounted.current) setResult({ status: current.controller.signal.aborted ? 'canceled' : 'failed', ...lastProgressRef.current,
        error: `${caught instanceof Error ? caught.message : '삭제 요청에 실패했습니다.'} 일부 항목이 삭제됐을 수 있으므로 목록을 확인하세요.` });
    } finally {
      clearTimeout(timer); if (operation.current === current) operation.current = null;
      if (mounted.current) {
        try { await refresh(); }
        catch { setError('삭제 결과는 확인했지만 목록을 갱신하지 못했습니다. 창을 다시 열어 확인하세요.'); }
        finally { if (mounted.current) { setPhase('done'); setStopping(false); } }
      }
    }
  }

  return { target, preview, phase, progress, result, error, stopping, active, begin, confirm,
    cancel: () => { setStopping(true); cancelOperation(); },
    close: () => { if (!operation.current) { setTarget(null); setResult(null); setError(''); } },
  };
}
