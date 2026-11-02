import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, HardDrive } from 'lucide-react';

export type FolderTreeItem = { path: string; name: string; drive?: boolean };

export function FileFolderTree({ rootPath, rootLabel, currentPath, loadChildren, onNavigate, onDropFiles, canDropPath = () => true }: {
  rootPath: string;
  rootLabel: string;
  currentPath: string;
  loadChildren: (path: string) => Promise<FolderTreeItem[]>;
  onNavigate: (path: string) => void;
  onDropFiles?: (path: string, files: File[]) => void;
  canDropPath?: (path: string) => boolean;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [children, setChildren] = useState<Record<string, FolderTreeItem[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dropPath, setDropPath] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  async function expand(path: string, retry = false) {
    if (!expanded.includes(path)) setExpanded(previous => [...previous, path]);
    if ((!retry && children[path]) || pending.current.has(path)) return;
    pending.current.add(path);
    try {
      const entries = await loadChildren(path);
      setChildren(previous => ({ ...previous, [path]: entries }));
      setErrors(previous => ({ ...previous, [path]: '' }));
    } catch (error) {
      setErrors(previous => ({ ...previous, [path]: error instanceof Error ? error.message : String(error) }));
    } finally {
      pending.current.delete(path);
    }
  }

  function toggle(path: string) {
    if (expanded.includes(path)) {
      setExpanded(previous => previous.filter(value => value !== path));
    } else {
      void expand(path);
    }
  }

  function renderFolder(item: FolderTreeItem, depth: number) {
    const isExpanded = expanded.includes(item.path);
    const entries = children[item.path] || [];
    return <div key={item.path} role="treeitem" aria-expanded={isExpanded} aria-selected={currentPath === item.path}>
      <div className={`file-tree-row${currentPath === item.path ? ' active' : ''}${dropPath === item.path ? ' drop-target' : ''}`} style={{ paddingLeft: 8 + depth * 15 }}
        onDragOver={onDropFiles && canDropPath(item.path) ? event => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); setDropPath(item.path); } } : undefined}
        onDragLeave={onDropFiles && canDropPath(item.path) ? event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropPath(null); } : undefined}
        onDrop={onDropFiles && canDropPath(item.path) ? event => { event.preventDefault(); event.stopPropagation(); setDropPath(null); onDropFiles(item.path, Array.from(event.dataTransfer.files)); } : undefined}>
        <button type="button" className="file-tree-toggle" onClick={() => toggle(item.path)} aria-label={`${item.name} ${isExpanded ? '접기' : '펼치기'}`}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button type="button" className="file-tree-folder" onClick={() => { onNavigate(item.path); void expand(item.path); }} title={item.name}>
          {item.drive ? <HardDrive size={15} /> : <Folder size={15} />}{item.name}
        </button>
      </div>
      {isExpanded && errors[item.path] && <button type="button" className="file-tree-error" onClick={() => void expand(item.path, true)}>{errors[item.path]} · 다시 시도</button>}
      {isExpanded && entries.length > 0 && <div role="group">{entries.map(child => renderFolder(child, depth + 1))}</div>}
    </div>;
  }

  return <aside className="pc-files-sidebar file-tree" aria-label="폴더 트리" role="tree">
    <div className="pc-files-sidebar-title">위치</div>
    {renderFolder({ path: rootPath, name: rootLabel, drive: true }, 0)}
  </aside>;
}
