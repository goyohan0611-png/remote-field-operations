import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Download, File, FileArchive, FileImage, FileText, FileVideo, Folder, HardDrive, LayoutGrid, List, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import type { SiteConnectionContext } from '@fieldlink/shared';
import { getSiteName } from '@fieldlink/shared';
import { useModalBackdrop } from '../../components/AppDialog';
import { formatFileSize } from './model';
import { parentPcPath, pcFileDate, pcPathCrumbs } from './pc-files-path';
import { FileFolderTree, type FolderTreeItem } from './FileFolderTree';
import { nextFileSort, type FileSort } from './file-sort';
import { useFileDeletion } from './useFileDeletion';
import { DeleteItemsDialog } from './DeleteItemsDialog';

type PcItem = { name: string; path: string; isDirectory: boolean; size: number; modifiedAt: string | null };
type Progress = { id: string; direction: 'upload' | 'download'; bytes: number; total: number | null };
type Navigation = { paths: string[]; index: number };
type LoadMode = 'push' | 'jump' | 'refresh' | 'more';

function itemIcon(item: PcItem, size: number) {
  if (item.isDirectory) return /^[a-z]:\\$/i.test(item.path) ? <HardDrive size={size} /> : <Folder size={size} />;
  const extension = item.name.split('.').pop()?.toLowerCase();
  if (extension && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension)) return <FileImage size={size} />;
  if (extension && ['mp4', 'mov', 'avi', 'mkv', 'ts'].includes(extension)) return <FileVideo size={size} />;
  if (extension && ['zip', '7z', 'rar'].includes(extension)) return <FileArchive size={size} />;
  if (extension && ['txt', 'log', 'ini', 'json', 'xml', 'pdf', 'doc', 'docx'].includes(extension)) return <FileText size={size} />;
  return <File size={size} />;
}

export function PcFilesDialog({ site, onClose, onDownloadStart, onDownloadFinish }: {
  site: SiteConnectionContext; onClose: () => void;
  onDownloadStart?: (job: { id: string; filename: string; requestedPath: string; totalBytes: number | null }) => void;
  onDownloadFinish?: (id: string, result: { status: 'completed' | 'canceled' | 'failed'; filePath?: string; error?: string }) => void;
}) {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<PcItem[]>([]);
  const [navigation, setNavigation] = useState<Navigation>({ paths: [''], index: 0 });
  const [selectedPath, setSelectedPath] = useState('');
  const [view, setView] = useState<'icons' | 'details'>('details');
  const [fileSort, setFileSort] = useState<FileSort>({ field: 'name', descending: false });
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [treeRevision, setTreeRevision] = useState(0);
  const transferId = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const deletion = useFileDeletion({ source: 'pc', site, refresh: async () => {
    // 부분 삭제도 폴더 구성을 바꾸므로 캐시된 트리를 함께 비운다.
    setTreeRevision(previous => previous + 1);
    await load(currentPath, 0, 'refresh');
  } });
  const backdrop = useModalBackdrop(onClose, progress?.direction === 'upload' || Boolean(deletion.target));

  async function load(path: string, offset = 0, mode: LoadMode = 'push', jumpIndex?: number, sorting = fileSort) {
    if (!window.kioskDesktop?.listPcFiles) {
      setError('PC 파일은 데스크톱 앱에서만 열 수 있습니다.');
      return;
    }
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const result = await window.kioskDesktop.listPcFiles({ site, path, offset, sortBy: sorting.field, descending: sorting.descending });
      if (sequence !== requestSequence.current) return;
      setCurrentPath(result.path);
      setItems((previous) => mode === 'more' ? [...previous, ...result.items] : result.items);
      setNextOffset(result.nextOffset);
      setMessage('');
      if (mode !== 'more') {
        setSelectedPath('');
        if (mode === 'push') {
          setNavigation((previous) => previous.paths[previous.index] === result.path ? previous : {
            paths: [...previous.paths.slice(0, previous.index + 1), result.path],
            index: previous.index + 1,
          });
        } else if (mode === 'jump' && jumpIndex !== undefined) {
          setNavigation((previous) => ({ ...previous, index: jumpIndex }));
        }
      }
    } catch (caught) {
      if (sequence === requestSequence.current) setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    setNavigation({ paths: [''], index: 0 });
    void load('', 0, 'refresh');
    const unsubscribe = window.kioskDesktop?.onPcTransferProgress?.((next) => {
      if (next.id === transferId.current) setProgress(next);
    });
    return () => {
      requestSequence.current += 1;
      unsubscribe?.();
    };
    // 현장을 바꾸면 대화상자가 다시 생성된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  const loadTreeChildren = useCallback(async (path: string): Promise<FolderTreeItem[]> => {
    if (!window.kioskDesktop?.listPcFiles) throw new Error('PC 파일을 열 수 없습니다.');
    const directories: FolderTreeItem[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const listing: { items: PcItem[]; nextOffset: number | null } = await window.kioskDesktop.listPcFiles({ site, path, offset });
      directories.push(...listing.items.filter(item => item.isDirectory).map(item => ({ path: item.path, name: item.name, drive: path === '' })));
      offset = listing.nextOffset;
    }
    return directories;
  }, [site]);

  async function transfer(direction: 'upload' | 'download', path?: string, directory = currentPath, sourcePath?: string, folder = false) {
    const id = [site.id, Date.now(), Math.random().toString(36).slice(2)].join(':');
    transferId.current = id;
    setProgress({ id, direction, bytes: 0, total: null });
    setError('');
    setMessage('');
    if (direction === 'download') {
      const filename = (path || '').split(/[\\/]/).at(-1) || 'PC 파일';
      onDownloadStart?.({ id, filename: filename + (folder ? '.zip' : ''), requestedPath: path || '',
        totalBytes: folder ? null : items.find(item => item.path === path)?.size ?? null });
    }
    try {
      const result = direction === 'upload'
        ? await window.kioskDesktop?.uploadPcFile?.({ id, site, directory, sourcePath })
        : folder ? await window.kioskDesktop?.downloadPcFolder?.({ id, site, path: path || '' })
          : await window.kioskDesktop?.downloadPcFile?.({ id, site, path: path || '' });
      if (result?.ok) {
        if (direction === 'upload' && directory === currentPath) await load(currentPath, 0, 'refresh');
        const excluded = 'skippedEntries' in result && result.skippedEntries ? ` · 접근 제한 항목 ${result.skippedEntries}개 제외` : '';
        setMessage(result.filename + (direction === 'upload' ? ' 업로드 완료' : ' 다운로드 완료') + excluded);
      }
      if (direction === 'download') onDownloadFinish?.(id, { status: result?.ok ? 'completed' : result?.canceled ? 'canceled' : 'failed', filePath: result && 'filePath' in result && typeof result.filePath === 'string' ? result.filePath : undefined });
      return result?.ok === true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      if (direction === 'download') onDownloadFinish?.(id, { status: 'failed', error: message });
      return false;
    } finally {
      transferId.current = null;
      setProgress(null);
    }
  }

  async function uploadDroppedFiles(directory: string, files: File[]) {
    if (deletion.target) return;
    if (!directory) { setError('업로드할 드라이브나 폴더를 먼저 선택하세요.'); return; }
    if (!window.kioskDesktop?.registerDroppedPcFiles || !files.length || progress) return;
    for (const file of files) {
      try {
        const registered = await window.kioskDesktop.registerDroppedPcFiles([file]);
        if (!registered.ok || registered.paths.length !== 1) throw new Error('끌어온 파일을 읽을 수 없습니다.');
        if (!await transfer('upload', undefined, directory, registered.paths[0])) break;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        break;
      }
    }
  }

  function handleDrop(event: React.DragEvent, directory: string) {
    if (deletion.target) return;
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault(); event.stopPropagation(); setDropPath(null);
    void uploadDroppedFiles(directory, Array.from(event.dataTransfer.files));
  }

  const busy = loading || Boolean(progress) || Boolean(deletion.target);
  const percent = progress?.total ? Math.min(100, Math.round(progress.bytes / progress.total * 100)) : null;
  const selectedItem = items.find((item) => item.path === selectedPath);
  const selectedFolder = selectedItem?.isDirectory && !/^[a-z]:\\$/i.test(selectedItem.path);
  const crumbs = pcPathCrumbs(currentPath);

  function openItem(item: PcItem) {
    if (item.isDirectory) void load(item.path);
    else void transfer('download', item.path);
  }

  function renderItem(item: PcItem, details: boolean) {
    return <button type="button" key={item.path} className={details ? `pc-files-detail-name${selectedPath === item.path ? ' selected' : ''}` : ['pc-files-tile', item.isDirectory ? 'folder' : 'file', selectedPath === item.path ? 'selected' : '', dropPath === item.path ? 'drop-target' : ''].join(' ')} disabled={busy} onClick={() => setSelectedPath(item.path)} onDoubleClick={() => openItem(item)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); openItem(item); } }} aria-label={item.name + (item.isDirectory ? ', 두 번 클릭하여 열기' : ', 두 번 클릭하여 다운로드')} title={item.name}
      onDragOver={item.isDirectory ? event => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); event.stopPropagation(); setDropPath(item.path); } } : undefined}
      onDrop={item.isDirectory ? event => handleDrop(event, item.path) : undefined}>
      <span className={details ? 'pc-files-detail-icon ' + (item.isDirectory ? 'folder' : 'file') : 'pc-files-tile-icon'}>{itemIcon(item, details ? 17 : 38)}</span><span className={details ? '' : 'pc-files-tile-name'}>{item.name}</span>
    </button>;
  }

  return <div className="modal-backdrop" {...backdrop}>
    {deletion.target && <DeleteItemsDialog key={deletion.target.path} deletion={deletion} />}
    <section inert={Boolean(deletion.target)} className="files-dialog pc-files-dialog" onClick={(event) => event.stopPropagation()} aria-label={getSiteName(site) + ' PC 파일'}>
      <header className="files-header">
        <div><h3>{getSiteName(site)} PC 파일</h3><p>학원 PC의 파일을 탐색하고 주고받습니다</p></div>
        <div className="files-header-actions">
          <button type="button" className="upload-button" disabled={busy || !currentPath} onClick={() => void transfer('upload')}><Upload size={14} />업로드</button>
          <button type="button" className="upload-button" disabled={busy || !selectedItem || (selectedItem.isDirectory && !selectedFolder)}
            onClick={() => void transfer('download', selectedItem?.path, currentPath, undefined, Boolean(selectedFolder))}><Download size={14} />{selectedFolder ? 'ZIP 다운로드' : '다운로드'}</button>
          <button type="button" className="delete-file-button" disabled={busy || !selectedItem || (selectedItem.isDirectory && !selectedFolder)} onClick={() => selectedItem && void deletion.begin(selectedItem)}><Trash2 size={14} />삭제</button>
          <button type="button" className="memo-close" disabled={progress?.direction === 'upload' || Boolean(deletion.target)} onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>
      </header>
      <nav className="pc-files-toolbar" aria-label="폴더 이동">
        <div className="pc-files-navigation">
          <button type="button" disabled={busy || navigation.index === 0} onClick={() => void load(navigation.paths[navigation.index - 1], 0, 'jump', navigation.index - 1)} aria-label="뒤로"><ArrowLeft size={16} /></button>
          <button type="button" disabled={busy || navigation.index >= navigation.paths.length - 1} onClick={() => void load(navigation.paths[navigation.index + 1], 0, 'jump', navigation.index + 1)} aria-label="앞으로"><ArrowRight size={16} /></button>
          <button type="button" disabled={busy || !currentPath} onClick={() => void load(parentPcPath(currentPath))} aria-label="상위 폴더"><ArrowUp size={16} /></button>
        </div>
        <div className="pc-files-address" aria-label="현재 경로">
          {crumbs.map((crumb, index) => <button type="button" key={crumb.path} className={index === crumbs.length - 1 ? 'active' : ''} disabled={busy || crumb.path === currentPath} onClick={() => void load(crumb.path)}>{index > 0 && <span aria-hidden="true">›</span>}{crumb.label}</button>)}
        </div>
        <button type="button" className="pc-files-refresh" disabled={busy} onClick={() => void load(currentPath, 0, 'refresh')} aria-label="새로고침"><RefreshCw size={16} /></button>
      </nav>
      <div className={error ? 'memo-error' : 'pc-files-message'} role={error ? 'alert' : 'status'}>{error || message || '\u00a0'}</div>
      <div className="pc-files-workspace">
        <FileFolderTree key={`${site.id}:${treeRevision}`} rootPath="" rootLabel="PC" currentPath={currentPath} loadChildren={loadTreeChildren}
          onNavigate={path => { if (!deletion.target) void load(path); }} onDropFiles={(path, files) => void uploadDroppedFiles(path, files)} canDropPath={path => Boolean(path) && !deletion.target} />
        <div className="pc-files-main">
          <div className="pc-files-viewbar">
            <span>{currentPath || 'PC'} <small>{!loading && items.length + '개 항목' + (nextOffset !== null ? ' 이상' : '')}</small></span>
            <div role="group" aria-label="보기 방식">
              <button type="button" className={view === 'icons' ? 'active' : ''} onClick={() => setView('icons')} aria-label="아이콘 보기" aria-pressed={view === 'icons'}><LayoutGrid size={15} /></button>
              <button type="button" className={view === 'details' ? 'active' : ''} onClick={() => setView('details')} aria-label="자세히 보기" aria-pressed={view === 'details'}><List size={16} /></button>
            </div>
          </div>
          <div className={`pc-files-list${dropPath === currentPath ? ' drop-target' : ''}`} aria-busy={loading}
            onDragOver={event => { if (currentPath && Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); setDropPath(currentPath); } }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropPath(null); }}
            onDrop={event => handleDrop(event, currentPath)}>
            {dropPath === currentPath && currentPath && <div className="pc-files-drop-indicator">이 폴더에 업로드</div>}
            {view === 'icons' ? <div className="pc-files-grid">{items.map((item) => renderItem(item, false))}</div>
              : <table className="pc-files-details"><thead><tr>{(['name', 'size', 'modifiedAt'] as const).map((field) => <th key={field} aria-sort={fileSort.field === field ? fileSort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" className="pc-files-sort" disabled={busy} onClick={() => { const next = nextFileSort(fileSort, field); setFileSort(next); void load(currentPath, 0, 'refresh', undefined, next); }}>{field === 'name' ? '이름' : field === 'size' ? '크기' : '수정일'}{fileSort.field === field && <span aria-hidden="true">{fileSort.descending ? ' ↓' : ' ↑'}</span>}</button></th>)}</tr></thead><tbody>
                {items.map((item) => <tr key={item.path} className={selectedPath === item.path ? 'selected' : ''}
                  onDragOver={item.isDirectory ? event => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); event.stopPropagation(); setDropPath(item.path); } } : undefined}
                  onDrop={item.isDirectory ? event => handleDrop(event, item.path) : undefined}><td>{renderItem(item, true)}</td><td>{item.isDirectory ? '—' : formatFileSize(item.size)}</td><td>{pcFileDate(item.modifiedAt)}</td></tr>)}
              </tbody></table>}
            {!loading && items.length === 0 && <div className="pc-files-empty">{currentPath ? '이 폴더에는 표시할 파일이 없습니다.' : '접근 가능한 드라이브가 없습니다.'}</div>}
            {loading && <div className="pc-files-empty">PC 파일 목록을 불러오는 중입니다.</div>}
            {nextOffset !== null && !loading && <button type="button" className="pc-files-more" disabled={busy} onClick={() => void load(currentPath, nextOffset, 'more')}>항목 더 보기</button>}
          </div>
        </div>
      </div>
      <footer className="pc-files-footer">
        {progress ? <><span>{progress.direction === 'upload' ? '업로드 중' : '다운로드 중'} · {formatFileSize(progress.bytes)}{progress.total ? ' / ' + formatFileSize(progress.total) : ''}</span><strong>{percent === null ? '전송 중' : percent + '%'}</strong><button type="button" onClick={() => void window.kioskDesktop?.cancelPcTransfer?.(progress.id)}>취소</button></>
          : <><span>{selectedItem ? selectedItem.name + (selectedFolder ? ' · 폴더를 ZIP으로 저장' : selectedItem.isDirectory ? ' · 드라이브 전체는 압축할 수 없습니다.' : ' · ' + formatFileSize(selectedItem.size)) : '파일이나 폴더를 선택하면 다운로드할 수 있습니다.'}</span><span>시스템 폴더는 접근할 수 없습니다.</span></>}
      </footer>
    </section>
  </div>;
}
