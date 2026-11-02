export type DownloadStatus = 'selecting' | 'downloading' | 'completed' | 'failed' | 'canceled';
export type TransferDirection = 'download' | 'upload' | 'recover';

export type DownloadState = {
  status: DownloadStatus;
  direction?: TransferDirection;
  percent: number | null;
  receivedBytes: number;
  totalBytes: number | null;
  filePath?: string;
  error?: string;
};

export type DownloadJob = DownloadState & {
  id: string;
  filename: string;
  siteName: string;
  requestedPath: string;
  source?: 'pc';
  transferMode?: 'drag';
  createdAt: number;
  updatedAt: number;
};

export type DownloadProgress = DownloadState & { id: string };

export const DOWNLOAD_HISTORY_KEY = 'kiosk-download-history-v1';
export const DOWNLOAD_DIR_KEY = 'kiosk-download-dir-v1';
export const DOWNLOAD_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DOWNLOAD_HISTORY_SAVE_DELAY_MS = 1000;
export const DOWNLOAD_PROGRESS_RENDER_INTERVAL_MS = 1000;

export function normalizeFilePath(value: string) {
  const joined = `/${value}`.replace(/\\/g, '/').replace(/\/+/g, '/');
  return joined === '' ? '/' : joined;
}

export function joinFilePath(basePath: string, name: string) {
  return normalizeFilePath(`${basePath}/${name}`);
}

export function parentFilePath(value: string) {
  const parts = normalizeFilePath(value).split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  return `/${parts.slice(0, -1).join('/')}`;
}

export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size < 0) return '-';
  if (size === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function getDownloadLabel(download?: DownloadState & { transferMode?: 'drag' }) {
  const action = download?.direction === 'upload' ? '업로드' : download?.direction === 'recover' ? '영상 복구' : '다운로드';
  if (!download) return action;
  if (download.transferMode === 'drag' && download.status === 'selecting') return '드래그 준비 중';
  if (download.status === 'selecting') return download.direction === 'upload' ? '파일 선택 중' : download.direction === 'recover' ? '영상 선택 중' : '폴더 선택 중';
  if (download.status === 'canceled') return '취소됨';
  if (download.status === 'failed') return '실패';
  if (download.status === 'completed') return '완료';
  if (download.percent !== null) return `${download.percent}%`;
  return download.direction === 'upload' ? '올리는 중' : download.direction === 'recover' ? '복구 중' : '받는 중';
}

export function getDownloadDetail(download?: DownloadState & { transferMode?: 'drag' }) {
  if (!download) return '';
  if (download.transferMode === 'drag' && download.status === 'selecting') return 'Windows 폴더로 옮길 파일을 준비하고 있습니다';
  if (download.status === 'selecting') {
    if (download.direction === 'upload') return '업로드할 파일을 선택하세요';
    if (download.direction === 'recover') return '복구할 영상과 정상 영상을 선택하세요';
    return '저장할 폴더를 선택하세요';
  }
  if (download.status === 'canceled') {
    if (download.direction === 'upload') return '업로드 취소됨';
    if (download.direction === 'recover') return '영상 복구 취소됨';
    return '다운로드 취소됨';
  }
  if (download.status === 'failed') {
    if (download.error) return download.error;
    if (download.direction === 'upload') return '업로드 실패';
    if (download.direction === 'recover') return '영상 복구 실패';
    return '다운로드 실패';
  }
  if (download.status === 'completed') {
    if (download.direction === 'upload') return '업로드 완료';
    if (download.direction === 'recover') return '복구 파일 저장 완료';
    if (download.transferMode === 'drag') return '끌어서 원하는 폴더에 저장할 수 있습니다';
    return '저장 완료';
  }
  if (download.totalBytes) {
    return `${formatFileSize(download.receivedBytes)} / ${formatFileSize(download.totalBytes)}`;
  }
  if (download.direction === 'recover') return '복구 프로그램 실행 중';
  return `${formatFileSize(download.receivedBytes)} ${download.direction === 'upload' ? '올리는 중' : '받는 중'}`;
}

export function restoreDownloadHistory(raw: string | null, now = Date.now()) {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, DownloadJob>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, job]) => now - job.updatedAt < DOWNLOAD_HISTORY_TTL_MS)
        .map(([id, job]) => [
          id,
          job.status === 'downloading' || job.status === 'selecting'
            ? {
                ...job,
                status: 'canceled' as DownloadStatus,
                percent: null,
                error: undefined,
                updatedAt: now,
              }
            : job,
        ]),
    );
  } catch {
    return {};
  }
}

export function readDownloadHistory() {
  if (typeof window === 'undefined') return {};
  return restoreDownloadHistory(window.localStorage.getItem(DOWNLOAD_HISTORY_KEY));
}

export function getRecentDownloadHistory(downloads: Record<string, DownloadJob>, now = Date.now()) {
  return Object.fromEntries(
    Object.entries(downloads).filter(([, job]) => now - job.updatedAt < DOWNLOAD_HISTORY_TTL_MS),
  );
}

export function updateDownloadJob(
  job: DownloadJob,
  progress: DownloadProgress,
  now = Date.now(),
): DownloadJob | undefined {
  const direction = progress.direction || job.direction || 'download';
  const unchanged = direction === job.direction
    && progress.status === job.status
    && progress.percent === job.percent
    && progress.receivedBytes === job.receivedBytes
    && progress.totalBytes === job.totalBytes
    && progress.filePath === job.filePath
    && progress.error === job.error;
  if (unchanged) return undefined;

  const isOngoingProgress = progress.status === 'downloading' && job.status === 'downloading';
  if (isOngoingProgress && now - job.updatedAt < DOWNLOAD_PROGRESS_RENDER_INTERVAL_MS) {
    return undefined;
  }

  return {
    ...job,
    direction,
    status: progress.status,
    percent: progress.percent,
    receivedBytes: progress.receivedBytes,
    totalBytes: progress.totalBytes,
    filePath: progress.filePath,
    error: progress.error,
    updatedAt: now,
  };
}
