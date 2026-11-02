import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { SiteConnectionContext, SiteFileItem, SiteFileList } from '@fieldlink/shared';

export function useFileBrowser(site: SiteConnectionContext, apiUrl: string, initialPath = '/') {
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState<SiteFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestSite = useRef(site);
  const requestSequence = useRef(0);
  useEffect(() => { latestSite.current = site; }, [site]);

  const loadFiles = useCallback(async (nextPath: string) => {
    const sequence = ++requestSequence.current;
    const target = latestSite.current;
    setLoading(true);
    setError('');
    try {
      const data = window.kioskDesktop?.listFiles
        ? await window.kioskDesktop.listFiles({ site: target, path: nextPath })
        : (await axios.get<SiteFileList>(`${apiUrl}/api/sites/${target.id}/files`, {
          params: { path: nextPath }, timeout: 10_000,
        })).data;
      if (sequence !== requestSequence.current) return;
      setCurrentPath(data.path);
      setItems(data.items);
      return data.path;
    } catch (loadError) {
      if (sequence === requestSequence.current) setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    setCurrentPath(initialPath);
    setItems([]);
    void loadFiles(initialPath);
    return () => { requestSequence.current += 1; };
    // 상태 수신으로 폴더를 초기화하지 않고 실제 접속 대상 변경에만 초기화한다.
  }, [loadFiles, site.id, site.ip, site.basePort, site.nvrLocalIp, initialPath]);

  return { currentPath, items, loading, error, setError, loadFiles };
}
