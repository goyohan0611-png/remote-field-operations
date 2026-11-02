import React, { useState } from 'react';
import { useAppDialog, useModalBackdrop } from '../../components/AppDialog';
import { formatFileSize } from '../transfers/model';

export type LocalVideoFile = {
  path: string;
  filename: string;
  size: number;
};

type VideoRecoveryDialogProps = {
  downloadDir: string;
  onDownloadDirChange: (dir: string) => void;
  onClose: () => void;
  onRecover: (options: {
    damagedFile: LocalVideoFile;
    sampleFile: LocalVideoFile;
    outputDir: string;
  }) => Promise<void>;
};

export function VideoRecoveryDialog({
  downloadDir,
  onDownloadDirChange,
  onClose,
  onRecover,
}: VideoRecoveryDialogProps) {
  const dialog = useAppDialog();
  const [damagedFile, setDamagedFile] = useState<LocalVideoFile | null>(null);
  const [sampleFile, setSampleFile] = useState<LocalVideoFile | null>(null);
  const [outputDir, setOutputDir] = useState(downloadDir);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  async function chooseVideo(kind: 'damaged' | 'sample') {
    if (!window.kioskDesktop?.selectRecoveryVideo) {
      await dialog.alert('데스크톱 앱에서만 영상 파일을 선택할 수 있습니다.');
      return;
    }

    const selection = await window.kioskDesktop.selectRecoveryVideo({
      title: kind === 'damaged' ? '복구할 영상 선택' : '정상 영상 선택',
      buttonLabel: '선택',
    });
    if (selection.canceled || !selection.file) return;

    if (kind === 'damaged') setDamagedFile(selection.file);
    else setSampleFile(selection.file);
  }

  async function chooseOutputDir() {
    if (!window.kioskDesktop?.selectDownloadDir) {
      await dialog.alert('데스크톱 앱에서만 저장 폴더를 설정할 수 있습니다.');
      return;
    }

    const selection = await window.kioskDesktop.selectDownloadDir();
    if (selection.canceled || !selection.dir) return;
    setOutputDir(selection.dir);
    onDownloadDirChange(selection.dir);
  }

  async function startRecovery(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!damagedFile) {
      setError('복구할 영상을 선택하세요.');
      return;
    }
    if (!sampleFile) {
      setError('정상 영상을 선택하세요.');
      return;
    }
    if (damagedFile.path === sampleFile.path) {
      setError('복구할 영상과 정상 영상은 서로 다른 파일이어야 합니다.');
      return;
    }
    if (!outputDir.trim()) {
      setError('저장 폴더를 설정하세요.');
      return;
    }

    setStarting(true);
    try {
      await onRecover({
        damagedFile,
        sampleFile,
        outputDir: outputDir.trim(),
      });
      onClose();
    } catch (recoverError) {
      setError(recoverError instanceof Error ? recoverError.message : String(recoverError));
    } finally {
      setStarting(false);
    }
  }

  const backdrop = useModalBackdrop(onClose, starting);

  return (
    <div className="modal-backdrop" {...backdrop}>
      <form className="site-edit-dialog recovery-dialog" onSubmit={startRecovery} onClick={(event) => event.stopPropagation()}>
        <header className="memo-header">
          <div>
            <h3>영상 복구</h3>
            <p>정상 샘플 영상과 손상된 영상을 선택해서 복구 파일을 만듭니다.</p>
          </div>
          <button type="button" className="memo-close" onClick={onClose} disabled={starting} aria-label="닫기">×</button>
        </header>

        {error && <div className="memo-error">{error}</div>}

        <div className="recovery-body">
          <button type="button" className="recovery-file-card" onClick={() => chooseVideo('damaged')} disabled={starting}>
            <span>복구할 영상</span>
            <strong>{damagedFile?.filename || '파일 선택'}</strong>
            <em>{damagedFile ? `${formatFileSize(damagedFile.size)} · ${damagedFile.path}` : '깨졌거나 재생이 안 되는 영상'}</em>
          </button>

          <button type="button" className="recovery-file-card" onClick={() => chooseVideo('sample')} disabled={starting}>
            <span>정상 영상</span>
            <strong>{sampleFile?.filename || '파일 선택'}</strong>
            <em>{sampleFile ? `${formatFileSize(sampleFile.size)} · ${sampleFile.path}` : '같은 녹화기에서 나온 정상 영상'}</em>
          </button>

          <div className="recovery-dir-row">
            <div>
              <span>저장 폴더</span>
              <strong>{outputDir || '설정 필요'}</strong>
            </div>
            <button type="button" onClick={chooseOutputDir} disabled={starting}>
              폴더 설정
            </button>
          </div>
        </div>

        <footer className="dialog-actions">
          <button type="button" onClick={onClose} disabled={starting}>취소</button>
          <button type="submit" className="primary" disabled={starting}>
            {starting ? '시작 중' : '복구 시작'}
          </button>
        </footer>
      </form>
    </div>
  );
}
