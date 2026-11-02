import { useEffect, useRef, useState } from 'react';
import type { useFileDeletion } from './useFileDeletion';
import { formatFileSize } from './model';

export function DeleteItemsDialog({ deletion, passwordRequired = false }: {
  deletion: ReturnType<typeof useFileDeletion>; passwordRequired?: boolean;
}) {
  const [password, setPassword] = useState('');
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const focusTarget = form.current?.querySelector<HTMLInputElement | HTMLButtonElement>(deletion.phase === 'confirm' && passwordRequired ? 'input' : 'button');
    focusTarget?.focus();
  }, [deletion.phase, passwordRequired]);
  if (!deletion.target) return null;
  const { target, preview, phase, progress, result, error, stopping } = deletion;
  const active = phase === 'checking' || phase === 'deleting';
  const percent = progress.total ? Math.round(progress.deleted / progress.total * 100) : 0;
  return <div className="delete-dialog-backdrop">
    <form ref={form} className="delete-dialog" role="dialog" aria-modal="true" aria-label="삭제 범위 확인"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!active) deletion.close(); }
        if (event.key === 'Tab') {
          const controls = Array.from(form.current?.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input:not(:disabled), button:not(:disabled)') || []);
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
        }
      }}
      onSubmit={event => { event.preventDefault(); void deletion.confirm(password); }}>
      <header><strong>{phase === 'done' ? '삭제 결과' : target.isDirectory ? '폴더 삭제' : '파일 삭제'}</strong><p>{target.name}</p></header>
      <p className="delete-target-path">{target.path}</p>
      {phase === 'checking' && <p role="status">삭제할 항목과 용량을 확인하고 있습니다.</p>}
      {preview && <p>파일 {preview.files.toLocaleString()}개 · 폴더 {preview.directories.toLocaleString()}개 · {formatFileSize(preview.bytes)}</p>}
      {phase === 'confirm' && <>
        <p className="delete-warning">이 범위의 항목을 영구 삭제합니다. 복구할 수 없으며, 삭제 중 중단해도 이미 삭제된 항목은 되돌릴 수 없습니다.</p>
        {passwordRequired && <input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="삭제 비밀번호" aria-label="삭제 비밀번호" />}
      </>}
      {phase === 'deleting' && <div role="status"><p>{stopping ? '중단 결과를 확인하고 있습니다.' : `${progress.deleted.toLocaleString()} / ${progress.total.toLocaleString()}개 삭제`}</p><progress max={100} value={percent} /><p>중단하면 남은 삭제를 멈춥니다. 이미 삭제한 항목은 복구되지 않습니다.</p></div>}
      {result && <div role={result.status === 'completed' ? 'status' : 'alert'}>
        <p>{result.status === 'completed' ? `삭제 완료 · ${result.deleted.toLocaleString()}개` : `삭제 ${result.status === 'canceled' ? '중단' : '실패'} · 확인된 삭제 ${result.deleted.toLocaleString()}개`}</p>
        {result.error && <p>{result.error}</p>}
        {result.status !== 'completed' && <p>일부 항목이 삭제됐을 수 있습니다. 새로고침된 목록을 확인하세요.</p>}
      </div>}
      {error && <p role="alert">{error}</p>}
      <div className="delete-dialog-actions">
        {active ? <button type="button" disabled={stopping} onClick={deletion.cancel}>{stopping ? '중단 요청됨' : phase === 'checking' ? '검사 취소' : '남은 삭제 중단'}</button>
          : <button type="button" onClick={deletion.close}>{phase === 'done' ? '닫기' : '취소'}</button>}
        {phase === 'confirm' && <button type="submit" className="danger" disabled={passwordRequired && !password}>영구 삭제</button>}
      </div>
    </form>
  </div>;
}
