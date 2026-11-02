type FirmwareVersionLinkProps = {
  version?: string;
  onOpen?: () => void;
};

export function FirmwareVersionLink({ version, onOpen }: FirmwareVersionLinkProps) {
  const firmwareVersion = version?.trim();
  const label = firmwareVersion ? `FW ${firmwareVersion}` : 'FW -';
  if (!onOpen || !firmwareVersion) {
    return <span title={firmwareVersion || '펌웨어 버전 없음'}>{label}</span>;
  }

  // 버전 클릭은 현장 행 선택과 구분하며 브라우저 화면만 연다.
  return (
    <button
      type="button"
      className="firmware-version-link"
      title="펌웨어 업데이트 화면 열기"
      aria-label={`펌웨어 ${firmwareVersion} 업데이트 화면 열기`}
      onClick={(event) => { event.stopPropagation(); onOpen(); }}
    >
      {label}
    </button>
  );
}
