export type FileSort = { field: 'name' | 'size' | 'modifiedAt'; descending: boolean };

export function nextFileSort(current: FileSort, field: FileSort['field']): FileSort {
  return { field, descending: current.field === field ? !current.descending : false };
}

export function sortFileItems<T extends { name: string; isDirectory: boolean; size: number; modifiedAt: string | null }>(items: T[], sort: FileSort): T[] {
  const nameOrder = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
  return [...items].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    if (sort.field === 'modifiedAt') {
      if (!a.modifiedAt || !b.modifiedAt) {
        if (!a.modifiedAt && b.modifiedAt) return 1;
        if (a.modifiedAt && !b.modifiedAt) return -1;
      } else {
        const delta = Date.parse(a.modifiedAt) - Date.parse(b.modifiedAt);
        if (delta) return sort.descending ? -delta : delta;
      }
    } else if (sort.field === 'size') {
      const delta = a.size - b.size;
      if (delta) return sort.descending ? -delta : delta;
    }
    const delta = nameOrder.compare(a.name, b.name);
    return sort.field === 'name' && sort.descending ? -delta : delta;
  });
}
