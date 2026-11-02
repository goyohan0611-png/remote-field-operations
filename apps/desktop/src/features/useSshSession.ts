import { useEffect, useRef, useState } from 'react';
import type { SiteConnectionContext } from '@fieldlink/shared';
import { createSshOutputFilter } from './ssh-output';

export function useSshSession(site: SiteConnectionContext) {
  const sessionIdRef = useRef('');
  const latestSite = useRef(site);
  useEffect(() => { latestSite.current = site; }, [site]);
  const [output, setOutput] = useState('연결 중...\n');
  const [connected, setConnected] = useState(false);
  const [closed, setClosed] = useState(false);
  const [retry, setRetry] = useState(0);
  const tunnelReady = site.agentStatus?.connection === 'online' && site.agentStatus.tunnelState === 'online';
  const previousReady = useRef(tunnelReady);

  useEffect(() => {
    const recovered = tunnelReady && !previousReady.current;
    previousReady.current = tunnelReady;
    if (recovered && closed) setRetry((current) => current + 1);
  }, [tunnelReady, closed]);

  useEffect(() => {
    let active = true;
    const sessionId = `ssh-${site.id}-${crypto.randomUUID()}`;
    const filterOutput = createSshOutputFilter();
    sessionIdRef.current = sessionId;
    setConnected(false);
    setClosed(false);
    const disposers = [
      window.kioskDesktop?.onSshReady?.((payload) => {
        if (payload.id !== sessionId) return;
        setConnected(true);
        setOutput((current) => `${current}SSH 연결됨\n`);
      }),
      window.kioskDesktop?.onSshData?.((payload) => {
        if (payload.id !== sessionId || !payload.data) return;
        const text = filterOutput(payload.data);
        if (text) setOutput((current) => `${current}${text}`);
      }),
      window.kioskDesktop?.onSshError?.((payload) => {
        if (payload.id !== sessionId) return;
        setOutput((current) => `${current}\n오류: ${payload.error || 'SSH 오류'}\n`);
      }),
      window.kioskDesktop?.onSshClose?.((payload) => {
        if (payload.id !== sessionId) return;
        setConnected(false);
        setClosed(true);
        setOutput((current) => `${current}\n연결 종료\n`);
      }),
    ].filter(Boolean) as Array<() => void>;

    window.kioskDesktop?.startSshSession({ id: sessionId, site: latestSite.current, rows: 34, cols: 120 }).catch((error) => {
      if (!active) return;
      setOutput((current) => `${current}\n오류: ${error instanceof Error ? error.message : String(error)}\n`);
      setClosed(true);
    });

    return () => {
      active = false;
      disposers.forEach((dispose) => dispose());
      window.kioskDesktop?.closeSshSession(sessionId).catch(() => undefined);
    };
    // 상태 수신은 세션을 끊지 않는다. 실제 대상 변경이나 재시도만 새 세션을 만든다.
  }, [site.id, site.ip, site.basePort, site.nvrLocalIp, retry]);

  return {
    output, connected, closed,
    reconnect: () => setRetry((current) => current + 1),
    send: (data: string) => {
      if (data) window.kioskDesktop?.sendSshInput({ id: sessionIdRef.current, data });
    },
  };
}
