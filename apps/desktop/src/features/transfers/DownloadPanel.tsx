import { useEffect, useRef } from 'react';
import { getDownloadDetail, getDownloadLabel, type DownloadJob } from './model';

export function DownloadPanel({
  jobs,
  open,
  onCancel,
  onClose,
  onDismiss,
  onOpenLocation,
  onToggle,
  onClearFinished,
}: {
  jobs: DownloadJob[];
  open: boolean;
  onCancel: (id: string) => void;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onOpenLocation: (job: DownloadJob) => void;
  onToggle: () => void;
  onClearFinished: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const hasFinishedJobs = jobs.some((job) => job.status !== 'downloading' && job.status !== 'selecting');
  const activeCount = jobs.filter((job) => job.status === 'downloading' || job.status === 'selecting').length;

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutside(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);

  return (
    <section className="download-panel" aria-label="전송 목록" ref={panelRef}>
      <button
        type="button"
        className={`download-trigger ${activeCount > 0 ? 'active' : ''}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>전송</span>
        <strong>{activeCount > 0 ? activeCount : jobs.length}</strong>
      </button>

      {open && (
        <div className="download-dropdown">
          <header>
            <div>
              <strong>전송 목록</strong>
              <span>{jobs.length === 0 ? '목록 비어 있음' : `${jobs.length}개 작업`}</span>
            </div>
            <div className="transfer-actions">
              <button type="button" onClick={onClearFinished} disabled={!hasFinishedJobs}>기록 지우기</button>
            </div>
          </header>

          <div className="download-panel-list">
            {jobs.length === 0 && (
              <div className="download-empty">
                <strong>전송 목록이 없습니다.</strong>
                <span>파일 전송과 영상 복구 진행 상황이 여기에 표시됩니다.</span>
              </div>
            )}

            {jobs.map((job) => {
              const canOpenLocation = job.status === 'completed' && job.transferMode !== 'drag' && Boolean(job.filePath);
              return (
                <article
                  key={job.id}
                  className={`download-job ${job.status} ${canOpenLocation ? 'openable' : ''}`}
                  role={canOpenLocation ? 'button' : undefined}
                  tabIndex={canOpenLocation ? 0 : undefined}
                  title={canOpenLocation ? '클릭하여 파일 위치 열기' : undefined}
                  onClick={canOpenLocation ? () => onOpenLocation(job) : undefined}
                  onKeyDown={canOpenLocation ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenLocation(job);
                    }
                  } : undefined}
                >
                  <div className="download-job-main">
                    <div>
                      <strong>{job.filename}</strong>
                      <span>{job.siteName} · {job.source === 'pc' ? 'PC 다운로드' : job.direction === 'upload' ? '업로드' : job.direction === 'recover' ? '영상 복구' : '다운로드'} · {getDownloadLabel(job)}</span>
                    </div>
                    <p>{getDownloadDetail(job)}</p>
                  </div>

                  {(job.status === 'downloading' || job.status === 'selecting') && (
                    <div className="download-progress-track"><div style={{ width: `${job.percent ?? 0}%` }} /></div>
                  )}

                  <div className="download-job-actions">
                    {job.status === 'downloading' && <button type="button" onClick={() => onCancel(job.id)}>취소</button>}
                    {job.status !== 'downloading' && job.status !== 'selecting' && (
                      <button type="button" onClick={(event) => { event.stopPropagation(); onDismiss(job.id); }}>닫기</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
