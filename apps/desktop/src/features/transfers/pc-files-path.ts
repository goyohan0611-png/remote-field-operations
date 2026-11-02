export function parentPcPath(value: string): string {
  const path = value.replace(/\//g, '\\').replace(/\\+$/, '');
  if (!path || /^[a-z]:$/i.test(path)) return '';
  const index = path.lastIndexOf('\\');
  return index <= 2 ? `${path.slice(0, 2)}\\` : path.slice(0, index);
}

export function pcPathCrumbs(value: string): { label: string; path: string }[] {
  const normalized = value.replace(/\//g, '\\');
  const crumbs = [{ label: 'PC', path: '' }];
  if (!/^[a-z]:\\/i.test(normalized)) return crumbs;
  let path = normalized.slice(0, 3);
  crumbs.push({ label: path, path });
  for (const name of normalized.slice(3).split('\\').filter(Boolean)) {
    path += `${name}\\`;
    crumbs.push({ label: name, path: path.slice(0, -1) });
  }
  return crumbs;
}

export function pcFileDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR');
}
