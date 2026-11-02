import { useState } from 'react';
import type { Site, SiteAgentStatus } from '@fieldlink/shared';
import { getSiteConnectionAddresses } from '../features/site-connection-addresses';

export function SiteConnectionAddresses({ site, status }: { site: Site; status?: SiteAgentStatus }) {
  const addresses = getSiteConnectionAddresses(site, status);
  const [copiedAddress, setCopiedAddress] = useState('');
  const [copyError, setCopyError] = useState('');

  async function copyAddress(label: string, address: string) {
    setCopyError('');
    setCopiedAddress('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('클립보드 미지원');
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
    } catch {
      setCopyError(`${label} 주소를 복사하지 못했습니다. 주소를 직접 선택해 복사해 주세요.`);
    }
  }

  return <section className="inspector-section site-connection-addresses" aria-label="접속 주소">
    <h4>접속 주소</h4>
    <dl className="site-connection-address-list">
      {addresses.map(({ key, label, kind, address }) => <div key={key}>
        <dt>{label}<small>{kind}</small></dt>
        <dd>{address ? <code>{address}</code> : <span>미확인</span>}</dd>
        <button
          type="button"
          className="site-address-copy"
          aria-label={`${label} 주소 복사`}
          disabled={!address}
          onClick={(event) => {
            event.stopPropagation();
            if (address) void copyAddress(label, address);
          }}
        >{address && copiedAddress === address ? '복사됨' : '복사'}</button>
      </div>)}
    </dl>
    <p className="site-address-note">PC 주소와 장비 주소는 다릅니다. 접속하려면 터널 연결이 필요합니다.</p>
    {copiedAddress && <span className="site-address-feedback" role="status">주소를 복사했습니다.</span>}
    {copyError && <p className="site-address-error" role="alert">{copyError}</p>}
  </section>;
}
