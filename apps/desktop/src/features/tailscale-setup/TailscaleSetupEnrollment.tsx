import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { parseSetupInvitation, setupIssueError, setupServerUrl, setupTargetLabels, type SetupInvitation, type SetupTarget } from './model';

export function TailscaleSetupEnrollment({ apiUrl, target, isAdmin }: { apiUrl: string; target: SetupTarget; isAdmin: boolean }) {
  const [invitation, setInvitation] = useState<SetupInvitation | null>(null);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  const request = useRef<AbortController | null>(null);
  const copyGeneration = useRef(0);
  const server = setupServerUrl(apiUrl);
  const labels = setupTargetLabels(target);

  useEffect(() => () => { request.current?.abort(); copyGeneration.current += 1; }, []);
  useEffect(() => {
    if (!invitation) return;
    const remaining = Date.parse(invitation.expiresAt) - Date.now();
    const timer = window.setTimeout(() => { setExpired(true); setCopyFeedback(''); }, Math.max(0, Math.min(remaining, 2_147_483_647)));
    return () => window.clearTimeout(timer);
  }, [invitation]);

  if (!isAdmin) return null;

  async function issue() {
    if (!server || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    copyGeneration.current += 1;
    setLoading(true);
    // 재발급 요청이 서버에 도착하면 이전 코드가 무효화될 수 있어 먼저 화면에서 제거한다.
    setInvitation(null);
    setExpired(false);
    setError('');
    setCopyFeedback('');
    try {
      const response = await axios.post(`${server}/api/admin/tailscale-setup/codes`, labels, { signal: controller.signal, timeout: 15000 });
      const issued = parseSetupInvitation(response.data, target);
      if (controller.signal.aborted) return;
      setExpired(Date.parse(issued.expiresAt) <= Date.now());
      setInvitation(issued);
    } catch (failure) {
      if (!controller.signal.aborted) setError(setupIssueError(failure));
    } finally {
      if (!controller.signal.aborted) { request.current = null; setLoading(false); }
    }
  }

  async function copy() {
    if (!invitation || expired) return;
    if (Date.parse(invitation.expiresAt) <= Date.now()) { setExpired(true); setCopyFeedback(''); return; }
    const code = invitation.code;
    const generation = copyGeneration.current;
    setCopyFeedback('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(code);
      if (generation !== copyGeneration.current) return;
      if (Date.parse(invitation.expiresAt) <= Date.now()) { setExpired(true); return; }
      setCopyFeedback('설치 코드를 복사했습니다.');
    } catch {
      if (generation === copyGeneration.current) setCopyFeedback('복사하지 못했습니다. 아래 코드를 직접 선택해 복사해 주세요.');
    }
  }

  return <section className="inspector-section tailscale-setup-enrollment" aria-label="Tailscale 전용 설치" onClick={(event) => event.stopPropagation()}>
    <h4>Tailscale 전용 설치</h4>
    <p className="tailscale-setup-help">학원 키오스크에는 Tailscale만 설치합니다. OPS·에이전트는 설치하지 않습니다.</p>
    <p className="tailscale-setup-target">{labels.academy} · {labels.room}</p>
    <button type="button" className="agent-enrollment-button tailscale-setup-issue" disabled={!server || loading}
      onClick={() => { void issue(); }} aria-busy={loading}>
      {loading ? '코드 발급 중…' : invitation ? 'Tailscale 전용 코드 재발급' : 'Tailscale 전용 코드 발급'}
    </button>
    {!server && <p className="tailscale-setup-error" role="alert">HTTPS 서버에 연결한 OPS에서 발급할 수 있습니다.</p>}
    {loading && <p className="tailscale-setup-feedback" role="status">발급 중입니다. 완료될 때까지 기다려 주세요.</p>}
    {error && <p className="tailscale-setup-error" role="alert">{error}</p>}
    {invitation && <div className="tailscale-setup-result">
      <label className="tailscale-setup-code-label">키오스크 설치 코드
        <textarea readOnly value={invitation.code} rows={2} spellCheck={false} aria-label="Tailscale 전용 설치 코드" />
      </label>
      <div className="tailscale-setup-copy-row">
        <span role={expired ? 'status' : undefined}>{expired ? '코드 만료 · 다시 발급하세요' : '한 번만 사용 가능'}</span>
        <button type="button" className="site-address-copy" disabled={expired} onClick={() => { void copy(); }}>설치 코드 복사</button>
      </div>
      <p className="tailscale-setup-help">{new Date(invitation.expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}까지 · 한국시간</p>
      <dl className="tailscale-setup-details">
        <div><dt>회사망</dt><dd>{invitation.tailnetName}</dd></div>
        <div><dt>설치 번호</dt><dd>{invitation.siteId} <span>(OPS 현장 #{target.id}와 별도)</span></dd></div>
        <div><dt>4via6 경로</dt><dd><code>{invitation.route}</code></dd></div>
      </dl>
      <p className="tailscale-setup-help">현장용 ZIP의 설치.cmd에 입력하세요. 기존 에이전트 설치 코드와는 호환되지 않습니다. 재발급하면 이전 미사용 코드는 무효화됩니다.</p>
      {copyFeedback && <p className="tailscale-setup-feedback" role="status">{copyFeedback}</p>}
    </div>}
  </section>;
}
