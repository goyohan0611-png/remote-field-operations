import { demoUser } from './demo/bootstrap';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import {
  Camera,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Crop,
  Download,
  ExternalLink,
  File,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  List,
  Monitor,
  Pencil,
  Play,
  Power,
  RefreshCw,
  StickyNote,
  Terminal,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { io } from 'socket.io-client';
import type {
  AgentEnrollment,
  Academy,
  DashboardSnapshot,
  ServiceTask,
  Site,
  SiteConnectionContext,
  SiteFileItem,
  SiteFileList,
  SiteMemo,
  SiteAgentStatus,
  SiteStatus,
} from '@fieldlink/shared';
import {
  CHECK_KEYS,
  CHECK_INTERVAL_OPTIONS,
  MAX_SITE_BASE_PORT,
  getRdpPort,
  getSiteName,
  getSiteServicePorts,
  isIpv4InCidr,
  isPrivateIpv4Address,
  isValidPrivateIpv4Cidr,
  isValidSiteBasePort,
} from '@fieldlink/shared';
import appIconUrl from './demo/mark.svg';
import {
  AppDialogContext,
  AppDialogHost,
  normalizeDialogOptions,
  useAppDialog,
  useModalBackdrop,
  type AppDialogApi,
  type AppDialogRequest,
} from './components/AppDialog';
import { DownloadPanel } from './features/transfers/DownloadPanel';
import {
  DOWNLOAD_DIR_KEY,
  DOWNLOAD_HISTORY_KEY,
  DOWNLOAD_HISTORY_SAVE_DELAY_MS,
  formatFileSize,
  getRecentDownloadHistory,
  joinFilePath,
  normalizeFilePath,
  parentFilePath,
  readDownloadHistory,
  updateDownloadJob,
  type DownloadJob,
  type DownloadStatus,
} from './features/transfers/model';
import {
  VideoRecoveryDialog,
  type LocalVideoFile,
} from './features/video-recovery/VideoRecoveryDialog';
import { FirmwareVersionLink } from './features/nvr/FirmwareVersionLink';
import { useGoRtcSiteStream, useGoRtcStream } from './go2rtc';
import './styles.css';
import { installServerEditionGuard } from './features/server-profile';
import { AgentUpdates } from './features/agent-updates/AgentUpdates';
import { agentStatusLabel, applyAgentStatuses, useAgentStatuses } from './features/agent-status';
import { useFileBrowser } from './features/transfers/useFileBrowser';
import { PcFilesDialog } from './features/transfers/PcFilesDialog';
import { useFileDeletion } from './features/transfers/useFileDeletion';
import { listenForSessionRevocation } from './features/auth/session-events';
import { DeleteItemsDialog } from './features/transfers/DeleteItemsDialog';
import { FileFolderTree, type FolderTreeItem } from './features/transfers/FileFolderTree';
import { nextFileSort, sortFileItems, type FileSort } from './features/transfers/file-sort';
import { useSshSession } from './features/useSshSession';
import { SiteConnectionCells, SiteListHeader } from './components/SiteConnectionCells';
import { SiteConnectionAddresses } from './components/SiteConnectionAddresses';
import { TailscaleSetupEnrollment } from './features/tailscale-setup/TailscaleSetupEnrollment';
import { RecordingHistory } from './features/recordings/RecordingHistory';
import { DatePicker } from './components/DatePicker';
import { siteTone, siteToneLabel, type SiteTone } from './features/site-tone';

const API_URL = import.meta.env.VITE_API_URL || 'http://demo.invalid';
const APP_EDITION = import.meta.env.VITE_KIOSK_EDITION || 'stable';
axios.defaults.headers.common['X-Kiosk-Edition'] = APP_EDITION;
installServerEditionGuard(API_URL, APP_EDITION);
const AUTH_TOKEN_KEY = APP_EDITION === 'stable' ? 'fieldlink-demo-auth-v1' : 'fieldlink-demo-auth-preview-v1';
const CMS_DASHBOARD_URL = 'https://cms.example.invalid/Manager/Dashboard';

function getCloudLearningUrl(site: Site) {
  if (site.cloudLearningMode !== 'cloud' || !site.cloudOrgCode) return undefined;
  const orgCode = site.cloudOrgCode.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(orgCode)) return undefined;
  return `https://${orgCode}.example.invalid/`;
}

type AuthUser = {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
};

// 저장된 토큰을 axios 기본 헤더에 실어, 이후 모든 API 요청에 자동 첨부한다.
function applyAuthToken(token: string | null) {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    delete axios.defaults.headers.common.Authorization;
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function getStoredToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

type Tone = SiteTone;
type Filter = 'all' | Tone | 'recording';
type View = 'sites' | 'monitoring' | 'recordings' | 'quiet-hours' | 'service-tasks';
const MAX_CONCURRENT_PREVIEWS = 16;
type AccountTab = 'mypage' | 'notes' | 'admin' | 'agent-updates';
type AppUpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'error';
type AppUpdateInfo = {
  version: string;
  flavor: 'stable' | 'tunnel-preview';
  displayName: string;
  status: AppUpdateStatus;
  availableVersion: string | null;
  downloadPercent: number | null;
};

type ServiceTaskListResponse = {
  items: ServiceTask[];
  counts: { pending: number; completed: number };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
type CameraTypeFilter = 'all' | string;
type CropChannel = {
  channelId: number;
  cropUse: number;
  cropLeft: number;
  cropTop: number;
  cropWidth: number;
  cropHeight: number;
};
type DesktopUploadFile = {
  path: string;
  filename: string;
  size: number;
};
// 자동 검사 주기(ms) → 사이드바 버튼 라벨
const INTERVAL_LABELS: Record<number, string> = {
  60000: '1분',
  180000: '3분',
  300000: '5분',
  600000: '10분',
  1800000: '30분',
  3600000: '1시간',
};

const CROP_NATIVE_WIDTH = 1920;
const CROP_NATIVE_HEIGHT = 1080;
const CROP_MIN_SIZE = 120;
const CROP_SNAP = 4;
function useStableEvent<T extends (...args: any[]) => any>(handler: T): T {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  return useCallback(((...args: Parameters<T>) => handlerRef.current(...args)) as T, []);
}

const deviceStatusLabel: Record<string, string> = {
  online: '정상',
  offline: '오프라인',
  unknown: '미확인',
  skipped: '제외',
};
const serviceLabel: Record<(typeof CHECK_KEYS)[number], string> = {
  nvr: 'API',
  rtsp: 'RTSP',
  ftp: 'FTP',
  ssh: 'SSH',
  rdp: 'RDP',
  cam: 'CAM',
};

const agentConnectionLabel: Record<string, string> = {
  online: '에이전트 정상',
  offline: '에이전트 오프라인',
  not_installed: '에이전트 미설치',
};

const tunnelStateLabel: Record<string, string> = {
  disabled: '사용 안 함',
  not_installed: '미설치',
  online: '연결됨',
  needs_login: '로그인 필요',
  offline: '연결 끊김',
  error: '확인 오류',
};

const cameraTypeLabel: Record<string, string> = {
  g320: 'G320',
  ltc2: 'LTC2',
  kato: 'KATO',
  unknown: '미지정',
};

function normalizeCameraType(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'unknown';
}

function getCameraTypeLabel(value?: string | null) {
  const normalized = normalizeCameraType(value);
  return cameraTypeLabel[normalized] || normalized.toUpperCase();
}

function formatTime(value?: string) {
  if (!value) return '체크 전';
  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRecorderTime(value?: string) {
  if (!value) return '녹화기 시간 없음';

  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function recorderTimeTone(status?: SiteStatus) {
  const diff = Math.abs(status?.recorderTimeDiff ?? 0);
  if (diff >= 30 * 60) return 'danger';
  if (diff >= 5 * 60) return 'warning';
  return 'normal';
}

function getPortNumber(site: Site, key: string) {
  const ports = getSiteServicePorts(site.basePort);
  return ports[key as keyof typeof ports] ?? 0;
}

function formatSiteConnection(site: Site) {
  return site.basePort === 0 ? '로컬 직접 연결' : `base ${site.basePort}`;
}

function isTunnelConnection(site: Site) {
  return Boolean((site as SiteConnectionContext).agentStatus);
}

function SummaryTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: Filter;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`summary-tile ${tone} ${active ? 'active' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function StatusPill({ status, tone }: { status?: SiteStatus; tone: Tone }) {
  return <span className={`status-pill ${tone}`}>{siteToneLabel(tone, status)}</span>;
}

function PortChip({ label, value }: { label: string; value: string }) {
  const statusLabel = deviceStatusLabel[value] || value;

  return (
    <span className={`port-chip ${value}`} title={`${label} ${statusLabel}`}>
      <span className="status-dot" />
      <span className="port-label">{label}</span>
    </span>
  );
}

function TitleBar({ compact = false }: { compact?: boolean }) {
  return (
    <div className="titlebar">
      <div className="titlebar-controls">
        <button type="button" aria-label="최소화" onClick={() => window.kioskDesktop?.minimizeWindow()}>
          <span className="control-minimize" />
        </button>
        {!compact && (
          <button type="button" aria-label="최대화" onClick={() => window.kioskDesktop?.toggleMaximizeWindow()}>
            <span className="control-maximize" />
          </button>
        )}
        <button type="button" className="close" aria-label="닫기" onClick={() => window.kioskDesktop?.closeWindow()}>
          <span className="control-close" />
        </button>
      </div>
    </div>
  );
}

const ActionSiteCard = React.memo(function ActionSiteCard({
  site,
  status,
  agentStatus,
  tunnelEnabled,
  selected,
  currentUser,
  academies,
  onCheck,
  onDownloadFile,
  onUploadFiles,
  onUploadDroppedFiles,
  onDragDownload,
  onPcDownloadStart,
  onPcDownloadFinish,
  onPreview,
  onSelect,
  onSiteSaved,
  onSiteDeleted,
}: {
  site: Site;
  status?: SiteStatus;
  agentStatus?: SiteAgentStatus;
  tunnelEnabled: boolean;
  selected: boolean;
  currentUser: AuthUser;
  academies: { id: string; name: string }[];
  onCheck: (siteId: string) => Promise<void>;
  onDownloadFile: (site: Site, item: SiteFileItem, currentPath: string) => Promise<void>;
  onUploadFiles: (site: Site, currentPath: string) => Promise<void>;
  onUploadDroppedFiles: (site: Site, currentPath: string, files: File[]) => Promise<void>;
  onDragDownload: (site: Site, item: SiteFileItem, currentPath: string) => Promise<void>;
  onPcDownloadStart: (site: Site, job: { id: string; filename: string; requestedPath: string; totalBytes: number | null }) => void;
  onPcDownloadFinish: (id: string, result: { status: 'completed' | 'canceled' | 'failed'; filePath?: string; error?: string }) => void;
  onPreview: (siteId: string) => void;
  onSelect: (siteId: string) => void;
  onSiteSaved: (site: Site) => void;
  onSiteDeleted: (siteId: string) => void;
}) {
  const dialog = useAppDialog();
  const [checking, setChecking] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [pcFilesOpen, setPcFilesOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [serviceTaskOpen, setServiceTaskOpen] = useState(false);
  const [agentEnrollment, setAgentEnrollment] = useState<AgentEnrollment | null>(null);
  const [agentEnrollmentLoading, setAgentEnrollmentLoading] = useState(false);
  const displayName = getSiteName(site);
  const tone = siteTone(status, agentStatus, tunnelEnabled);
  const recording = status?.isRecording && tone !== 'offline';
  const dotTone = recording ? 'recording' : tone;
  const katoCamera = normalizeCameraType(site.cameraType) === 'kato';
  const cameraControlDisabled = katoCamera && !tunnelEnabled;
  const connectionSite = useMemo<SiteConnectionContext>(
    () => tunnelEnabled ? { ...site, agentStatus } : site,
    [agentStatus, site, tunnelEnabled],
  );
  const servicePorts = getSiteServicePorts(site.basePort);
  const cloudLearningUrl = getCloudLearningUrl(site);
  const hddUsedPct = status?.hddUsedPct == null ? null : Math.min(100, Math.max(0, status.hddUsedPct));

  async function handleCheck(event: React.SyntheticEvent) {
    event.stopPropagation();
    setChecking(true);
    try {
      await onCheck(site.id);
    } catch (error) {
      await dialog.alert({ title: '상태 확인 실패', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setChecking(false);
    }
  }

  async function handleRdp(event: React.SyntheticEvent) {
    event.stopPropagation();

    if (!window.kioskDesktop?.openRdp) {
      await dialog.alert('데스크톱 앱에서만 RDP 실행을 사용할 수 있습니다.');
      return;
    }

    try {
      await window.kioskDesktop.openRdp(connectionSite);
    } catch (error) {
      await dialog.alert({ title: 'RDP 실행 실패', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleSsh(event: React.SyntheticEvent) {
    event.stopPropagation();

    if (!window.kioskDesktop?.startSshSession) {
      await dialog.alert('데스크톱 앱에서만 SSH 접속을 사용할 수 있습니다.');
      return;
    }

    try {
      setSshOpen(true);
    } catch (error) {
      await dialog.alert({ title: 'SSH 접속 실패', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleOpenCloudLearning(event: React.SyntheticEvent) {
    event.stopPropagation();
    if (!cloudLearningUrl || !window.kioskDesktop?.openExternalUrl) return;

    try {
      await window.kioskDesktop.openExternalUrl(cloudLearningUrl);
    } catch (error) {
      await dialog.alert({ title: '클라우드러닝 열기 실패', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleOpenCms(event: React.SyntheticEvent) {
    event.stopPropagation();
    if (!window.kioskDesktop?.openExternalUrl) return;

    try {
      await window.kioskDesktop.openExternalUrl(CMS_DASHBOARD_URL);
    } catch (error) {
      await dialog.alert({ title: 'CMS 열기 실패', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleOpenFirmwareWeb() {
    if (!window.kioskDesktop?.openNvrFirmwareWeb) {
      await dialog.alert('데스크톱 앱에서만 펌웨어 화면을 열 수 있습니다.');
      return;
    }
    try {
      await window.kioskDesktop.openNvrFirmwareWeb(connectionSite);
    } catch (error) {
      await dialog.alert({ title: '펌웨어 화면 열기 실패', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleOpenCameraControl(event: React.SyntheticEvent) {
    event.stopPropagation();
    if (cameraControlDisabled) return;

    const openCamera = katoCamera ? window.kioskDesktop?.openKatoCameraWeb : window.kioskDesktop?.openFieldlinkCamera;
    if (!openCamera) {
      await dialog.alert('데스크톱 앱에서만 카메라 제어를 사용할 수 있습니다.');
      return;
    }

    try {
      await openCamera(connectionSite);
    } catch (error) {
      await dialog.alert({ title: '카메라 제어 실행 실패', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleSyncTime(event: React.SyntheticEvent) {
    event.stopPropagation();

    if (!window.kioskDesktop?.syncNvrTime) {
      await dialog.alert('데스크톱 앱에서만 시간 동기화를 사용할 수 있습니다.');
      return;
    }
    if (!await dialog.confirm({
      title: '시간 동기화',
      message: `[${displayName}] 녹화기 시간을 PC 시간으로 동기화할까요?`,
      confirmText: '동기화',
    })) return;

    try {
      await window.kioskDesktop.syncNvrTime(connectionSite);
      await dialog.alert('시간 동기화 요청을 전송했습니다.');
    } catch (error) {
      await dialog.alert({ title: '시간 동기화 실패', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleReboot(event: React.SyntheticEvent) {
    event.stopPropagation();

    if (!window.kioskDesktop?.rebootNvr) {
      await dialog.alert('데스크톱 앱에서만 녹화기 재부팅을 사용할 수 있습니다.');
      return;
    }
    if (!await dialog.confirm({
      title: '녹화기 재부팅',
      message: `[${displayName}] 녹화기를 재부팅할까요?`,
      confirmText: '재부팅',
      tone: 'danger',
    })) return;

    try {
      await window.kioskDesktop.rebootNvr(connectionSite);
      await dialog.alert('녹화기 재부팅 요청을 전송했습니다.');
    } catch (error) {
      await dialog.alert({ title: '녹화기 재부팅 실패', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleDeleteSite(event: React.SyntheticEvent) {
    event.stopPropagation();
    if (!await dialog.confirm({
      title: '현장 삭제',
      message: `[${displayName}] 현장을 삭제할까요?\n공용 서버에서는 기존판과 Tailscale판 양쪽에서 삭제됩니다. 상태, 메모, 검사 기록도 함께 정리됩니다.`,
      confirmText: '삭제',
      tone: 'danger',
    })) return;
    try {
      await axios.delete(`${API_URL}/api/sites/${site.id}`);
      onSiteDeleted(site.id);
    } catch (error: any) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.response?.data?.error || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      await dialog.alert({ title: '현장 삭제 실패', message });
    }
  }

  async function issueAgentEnrollment(event: React.SyntheticEvent) {
    event.stopPropagation();
    setAgentEnrollmentLoading(true);
    try {
      const response = await axios.post<AgentEnrollment>(`${API_URL}/api/admin/sites/${site.id}/agent-enrollment`);
      setAgentEnrollment(response.data);
    } catch (error) {
      await dialog.alert({
        title: '에이전트 등록 코드 발급 실패',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setAgentEnrollmentLoading(false);
    }
  }

  return (
    <article className={`site-card action-site-card ${tone} ${recording ? 'recording' : ''} ${selected ? 'selected' : ''}`}>
      <div
        className={`site-row site-row-button ${tunnelEnabled ? 'tunnel-layout' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => onSelect(site.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(site.id);
          }
        }}
      >
        <span className={`site-status-dot ${dotTone}`} />

        <div className="site-heading">
          <div className="site-title-line">
            <span className="site-id">#{site.id}</span>
            <h3>{displayName}</h3>
            {!tunnelEnabled && <span className={`site-agent-badge ${agentStatus?.connection || 'not_installed'}`}>
              {agentStatusLabel(agentStatus, agentConnectionLabel[agentStatus?.connection || 'not_installed'])}
            </span>}
          </div>
          <p>{site.academyName}</p>
        </div>

        {tunnelEnabled && <SiteConnectionCells status={agentStatus} />}
        {!tunnelEnabled && (
          <span className="site-connection-cell" title={`${site.ip} · ${formatSiteConnection(site)}`}>
            {site.ip} <b>· {formatSiteConnection(site)}</b>
          </span>
        )}

        <div className="site-port-badges" aria-label="서비스 상태">
          {CHECK_KEYS.map((key) => (
            <span key={key} className={`port-badge ${status?.checks[key] || 'unknown'}`}>
              {serviceLabel[key]}
            </span>
          ))}
        </div>

        <span className="site-cell site-cell-center site-fw-cell">
          <FirmwareVersionLink version={status?.firmwareVersion} onOpen={tunnelEnabled ? handleOpenFirmwareWeb : undefined} />
        </span>

        <span className={`site-cell site-cell-center recorder-time ${recorderTimeTone(status)}`}>
          {formatRecorderTime(status?.recorderTime)}
        </span>

        <span className="site-cell site-hdd-cell">
          <span className="site-hdd-track" aria-hidden="true">
            <span
              className={hddUsedPct != null && hddUsedPct >= 80 ? 'danger' : ''}
              style={{ width: `${hddUsedPct ?? 0}%` }}
            />
          </span>
          <span>{hddUsedPct == null ? '—' : `${hddUsedPct}%`}</span>
        </span>

        <div className="site-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-action" aria-label="상태 확인" onClick={handleCheck} disabled={checking}>
            <RefreshCw className={checking ? 'spin' : ''} size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="icon-action"
            aria-label="미리보기"
            onClick={(event) => {
              event.stopPropagation();
              onPreview(site.id);
            }}
          >
            <Play size={15} strokeWidth={2} />
          </button>
          <button type="button" className="site-rdp-button" onClick={handleRdp} aria-label="RDP 연결">
            <Monitor size={14} strokeWidth={2} />
            <span>RDP</span>
          </button>
        </div>
      </div>

      {selected && (
        <aside className="site-inspector" aria-label={`${displayName} 상세 정보`}>
          <header className="site-inspector-header">
            <div>
              <div className="site-inspector-title">
                <h3>{displayName}</h3>
                <StatusPill status={status} tone={tone} />
              </div>
              <p>{tunnelEnabled
                ? `${site.academyName} · ${getCameraTypeLabel(site.cameraType)}`
                : `${site.academyName} · ${site.ip} · ${formatSiteConnection(site)} · ${getCameraTypeLabel(site.cameraType)}`}</p>
            </div>
            <button type="button" className="inspector-close" onClick={() => onSelect(site.id)} aria-label="상세 패널 닫기">
              <X size={18} strokeWidth={2} />
            </button>
          </header>

          <div className="site-inspector-body">
            <section className="inspector-section inspector-agent-section">
              <h4>현장 에이전트</h4>
              <dl className="inspector-meta-list">
                <div><dt>상태</dt><dd className={agentStatus?.connection || 'not_installed'}>{agentStatusLabel(agentStatus, agentConnectionLabel[agentStatus?.connection || 'not_installed'])}</dd></div>
                <div><dt>마지막 통신</dt><dd>{formatTime(agentStatus?.lastSeenAt)}</dd></div>
                <div><dt>버전</dt><dd>{agentStatus?.version || '—'}</dd></div>
                {!tunnelEnabled && <div><dt>현재 공인 IP</dt><dd>{agentStatus?.currentPublicIp || site.ip || '—'}</dd></div>}
                {!tunnelEnabled && <div><dt>이전 공인 IP</dt><dd>{agentStatus?.previousPublicIp || '—'}</dd></div>}
                <div><dt>원격 연결</dt><dd>{agentStatus?.tunnelState ? tunnelStateLabel[agentStatus.tunnelState] : '—'}</dd></div>
              </dl>
              {!tunnelEnabled && agentStatus?.pendingPublicIp && (
                <p className="agent-ip-pending">새 IP {agentStatus.pendingPublicIp} 확인 중</p>
              )}
              {currentUser.role === 'admin' && (
                <button type="button" className="agent-enrollment-button" onClick={issueAgentEnrollment} disabled={agentEnrollmentLoading}>
                  {agentEnrollmentLoading ? '발급 중…' : '에이전트 등록 코드 발급'}
                </button>
              )}
              {agentEnrollment && (
                <div className="agent-enrollment-code">
                  <strong>{agentEnrollment.code}</strong>
                  <span>{formatTime(agentEnrollment.expiresAt)}까지 유효 · 한 번만 사용 가능</span>
                </div>
              )}
            </section>

            {tunnelEnabled && <SiteConnectionAddresses key={site.id} site={site} status={agentStatus} />}

            {tunnelEnabled && <TailscaleSetupEnrollment
              key={`${site.id}:${site.academyName}:${displayName}`}
              apiUrl={API_URL}
              target={site}
              isAdmin={currentUser.role === 'admin'}
            />}

            <section className="inspector-section">
              <h4>서비스 상태</h4>
              <div className="inspector-port-grid">
                {CHECK_KEYS.map((key) => {
                  const value = status?.checks[key] || 'unknown';
                  return (
                    <div key={key} className={`inspector-port ${value}`}>
                      <span className="inspector-port-dot" />
                      <strong>{serviceLabel[key]}</strong>
                      {!tunnelEnabled && <span>:{getPortNumber(site, key)}</span>}
                      <em>{deviceStatusLabel[value]}</em>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="inspector-section">
              <h4>운영 정보</h4>
              <dl className="inspector-meta-list">
                <div><dt>펌웨어</dt><dd><FirmwareVersionLink version={status?.firmwareVersion} onOpen={tunnelEnabled ? handleOpenFirmwareWeb : undefined} /></dd></div>
                <div><dt>녹화기 시간</dt><dd className={recorderTimeTone(status)}>{formatRecorderTime(status?.recorderTime)}</dd></div>
                <div><dt>HDD 사용률</dt><dd>{hddUsedPct == null ? '—' : `${hddUsedPct}%`}</dd></div>
                <div><dt>녹화 상태</dt><dd className={status?.isRecording ? 'recording' : ''}>{status?.isRecording ? '녹화 중' : '대기'}</dd></div>
                <div><dt>최근 검사</dt><dd>{formatTime(status?.checkedAt)}</dd></div>
                {tunnelEnabled ? <>
                  <div><dt>자동 종료</dt><dd>{!site.shutdownDetectedAt ? '설정 확인 전' : site.quietFrom ? `${site.quietFrom} 종료 · ${site.quietTo || '07:00'} 기동` : '사용 안 함'}</dd></div>
                  <div><dt>클라우드러닝</dt><dd>{!site.cloudDetectedAt ? '설정 확인 전' : site.cloudLearningMode === 'cloud' ? '사용 중' : '사용 안 함'}</dd></div>
                  {site.cloudLearningMode === 'cloud' && <div><dt>ORG 코드</dt><dd>{site.cloudOrgCode || '확인 필요'}</dd></div>}
                </> : <div><dt>체크 제외</dt><dd>{site.quietFrom || '—'} - {site.quietTo || '—'}</dd></div>}
              </dl>
            </section>

            <section className="inspector-section">
              <h4>접속 · 파일</h4>
              <div className="inspector-action-grid">
                {tunnelEnabled ? <>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setLogOpen(true); }}><FileText size={15} />로그 보기</button>
                  <button type="button" onClick={handleSsh}><Terminal size={15} />SSH 접속</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setFilesOpen(true); }}><FolderOpen size={15} />녹화기 파일</button>
                  <button type="button" disabled={currentUser.role !== 'admin'} title={currentUser.role !== 'admin' ? '관리자만 사용할 수 있습니다.' : undefined}
                    onClick={(event) => { event.stopPropagation(); setPcFilesOpen(true); }}><FolderOpen size={15} />PC 파일</button>
                </> : <>
                  <button type="button" onClick={handleRdp}><Monitor size={15} />RDP :{servicePorts.rdp}</button>
                  <button type="button" onClick={handleSsh}><Terminal size={15} />SSH 접속</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setFilesOpen(true); }}><FolderOpen size={15} />파일 탐색</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setLogOpen(true); }}><FileText size={15} />로그 보기</button>
                </>}
                {cloudLearningUrl && (
                  <button type="button" onClick={handleOpenCloudLearning}><ExternalLink size={15} />클라우드러닝</button>
                )}
                {cloudLearningUrl && (
                  <button type="button" onClick={handleOpenCms}><ExternalLink size={15} />CMS</button>
                )}
              </div>
            </section>

            <section className="inspector-section">
              <h4>제어</h4>
              <div className="inspector-action-grid">
                <button
                  type="button"
                  disabled={cameraControlDisabled}
                  title={cameraControlDisabled ? '기존판에서는 KATO 카메라 웹 접속을 지원하지 않습니다.' : undefined}
                  onClick={handleOpenCameraControl}
                >
                  <Camera size={15} />{katoCamera && tunnelEnabled ? '카메라 웹' : '카메라 제어'}
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setCropOpen(true); }}><Crop size={15} />크롭 설정</button>
                <button type="button" onClick={handleSyncTime}><Clock3 size={15} />시간 동기화</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setMemoOpen(true); }}><StickyNote size={15} />메모 작성</button>
              </div>
              <button type="button" className="inspector-reboot" onClick={handleReboot}><Power size={15} />녹화기 재부팅</button>
              <button type="button" className="inspector-service-task" onClick={(event) => { event.stopPropagation(); setServiceTaskOpen(true); }}>
                <Wrench size={14} />AS 목록 추가
              </button>
            </section>
          </div>

          <footer className="site-inspector-footer">
            <button type="button" onClick={(event) => { event.stopPropagation(); setEditOpen(true); }}><Pencil size={14} />현장 수정</button>
            <button type="button" className="danger" onClick={handleDeleteSite}><Trash2 size={14} />현장 삭제</button>
          </footer>
        </aside>
      )}

      {memoOpen && <MemoDialog site={site} currentUser={currentUser} onClose={() => setMemoOpen(false)} />}
      {serviceTaskOpen && <ServiceTaskDialog site={site} onClose={() => setServiceTaskOpen(false)} />}
      {filesOpen && (
        <FilesDialog
          site={connectionSite}
          onClose={() => setFilesOpen(false)}
          onDownloadFile={onDownloadFile}
          onUploadFiles={onUploadFiles}
          onUploadDroppedFiles={onUploadDroppedFiles}
          onDragDownload={onDragDownload}
        />
      )}
      {pcFilesOpen && tunnelEnabled && <PcFilesDialog site={connectionSite} onClose={() => setPcFilesOpen(false)}
        onDownloadStart={job => onPcDownloadStart(site, job)} onDownloadFinish={onPcDownloadFinish} />}
      {sshOpen && <SshDialog site={connectionSite} onClose={() => setSshOpen(false)} />}
      {logOpen && <LogDialog site={connectionSite} onClose={() => setLogOpen(false)} />}
      {cropOpen && <CropDialog site={connectionSite} onClose={() => setCropOpen(false)} />}
      {editOpen && (
        <SiteFormDialog
          site={site}
          academies={academies}
          tunnelEnabled={tunnelEnabled}
          onClose={() => setEditOpen(false)}
          onSaved={(savedSite) => {
            onSiteSaved(savedSite);
            setEditOpen(false);
          }}
        />
      )}
    </article>
  );
}, (prev, next) => (
  // 콜백 props는 부모에서 안정된 이벤트 래퍼로 전달되므로 비교에서 제외한다.
  // site/status/academies는 실제로 바뀐 값만 새 참조를 받으므로, 소켓으로
  // 다른 현장의 상태만 갱신될 때 나머지 92개 카드가 전부 리렌더링되는 것을 막아준다.
  prev.site === next.site
  && prev.status === next.status
  && prev.agentStatus === next.agentStatus
  && prev.tunnelEnabled === next.tunnelEnabled
  && prev.selected === next.selected
  && prev.currentUser === next.currentUser
  && prev.academies === next.academies
));

function getMemoAuthorLabel(memo: SiteMemo) {
  if (memo.authorName && memo.authorUsername) return `${memo.authorName} (@${memo.authorUsername})`;
  return memo.authorName || (memo.authorUsername ? `@${memo.authorUsername}` : '이전 작성자');
}

function MemoDialog({ site, currentUser, onClose }: { site: Site; currentUser: AuthUser; onClose: () => void }) {
  const dialog = useAppDialog();
  const [memos, setMemos] = useState<SiteMemo[]>([]);
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadMemos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get<SiteMemo[]>(`${API_URL}/api/sites/${site.id}/memos`);
      setMemos(res.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [site.id]);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  async function addMemo() {
    const nextContent = content.trim();
    if (!nextContent) return;

    setSaving(true);
    setError('');
    try {
      const res = await axios.post<SiteMemo>(`${API_URL}/api/sites/${site.id}/memos`, { content: nextContent });
      setMemos((current) => [res.data, ...current]);
      setContent('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function updateMemo(memoId: string) {
    const nextContent = editingContent.trim();
    if (!nextContent) return;

    setSaving(true);
    setError('');
    try {
      const res = await axios.put<SiteMemo>(`${API_URL}/api/memos/${memoId}`, { content: nextContent });
      setMemos((current) => current.map((memo) => (memo.id === memoId ? res.data : memo)));
      setEditingId('');
      setEditingContent('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function removeMemo(memoId: string) {
    if (!await dialog.confirm({
      title: '메모 삭제',
      message: '메모를 삭제할까요?',
      confirmText: '삭제',
      tone: 'danger',
    })) return;

    setSaving(true);
    setError('');
    try {
      await axios.delete(`${API_URL}/api/memos/${memoId}`);
      setMemos((current) => current.filter((memo) => memo.id !== memoId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setSaving(false);
    }
  }

  const backdrop = useModalBackdrop(onClose);

  return (
    <div className="modal-backdrop" {...backdrop}>
      <section className="memo-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="memo-header">
          <div>
            <h3>{getSiteName(site)} 메모</h3>
            <p>{site.academyName} · {memos.length}개</p>
          </div>
          <button type="button" className="memo-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <div className="memo-compose">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="공유할 메모를 입력하세요"
            maxLength={2000}
          />
          <button type="button" onClick={addMemo} disabled={saving || !content.trim()}>
            저장
          </button>
        </div>

        {error && <div className="memo-error">{error}</div>}

        <div className="memo-list">
          {loading && <div className="memo-empty">메모를 불러오는 중입니다.</div>}
          {!loading && memos.length === 0 && <div className="memo-empty">아직 메모가 없습니다.</div>}
          {!loading && memos.map((memo) => {
            const canEdit = currentUser.role === 'admin' || memo.authorId === currentUser.id;
            return (
              <article key={memo.id} className="memo-item">
                {editingId === memo.id ? (
                  <>
                    <textarea
                      value={editingContent}
                      onChange={(event) => setEditingContent(event.target.value)}
                      maxLength={2000}
                    />
                    <div className="memo-item-actions">
                      <button type="button" onClick={() => updateMemo(memo.id)} disabled={saving || !editingContent.trim()}>
                        저장
                      </button>
                      <button type="button" onClick={() => setEditingId('')}>
                        취소
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>{memo.content}</p>
                    <footer>
                      <span>{getMemoAuthorLabel(memo)} · {formatTime(memo.createdAt)}</span>
                      {canEdit && (
                        <div className="memo-item-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(memo.id);
                              setEditingContent(memo.content);
                            }}
                          >
                            수정
                          </button>
                          <button type="button" onClick={() => removeMemo(memo.id)}>
                            삭제
                          </button>
                        </div>
                      )}
                    </footer>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function formatFileDate(value: string | null) {
  if (!value) return '-';

  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SshDialog({ site, onClose }: { site: SiteConnectionContext; onClose: () => void }) {
  const outputRef = useRef<HTMLPreElement>(null);
  const { output, connected, closed, reconnect, send } = useSshSession(site);
  const [command, setCommand] = useState('');

  useEffect(() => {
    const outputElement = outputRef.current;
    if (!outputElement) return;
    outputElement.scrollTop = outputElement.scrollHeight;
  }, [output]);

  function submitCommand(event: React.FormEvent) {
    event.preventDefault();
    if (!command.trim() || closed) return;
    send(`${command}\n`);
    setCommand('');
  }

  return (
    <div className="modal-backdrop">
      <section className="ssh-dialog">
        <header>
          <div>
            <strong>SSH 접속</strong>
            <span>{getSiteName(site)}{isTunnelConnection(site) ? ' · 터널 연결' : ` · ${site.ip}`}</span>
          </div>
          <button type="button" className="memo-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <pre ref={outputRef} className="ssh-output">{output}</pre>

        {closed && <button type="button" onClick={reconnect}>다시 연결</button>}

        <form className="ssh-input-row" onSubmit={submitCommand}>
          <button type="button" onClick={() => send('\x03')} disabled={!connected || closed}>
            Ctrl+C
          </button>
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Tab' || (event.ctrlKey && event.code === 'Space')) {
                event.preventDefault();
                send(`${command}\t`);
                setCommand('');
              }
            }}
            placeholder={connected ? '명령어 입력' : '연결 대기 중'}
            disabled={!connected || closed}
            autoFocus
          />
          <button type="submit" disabled={!connected || closed || !command.trim()}>
            전송
          </button>
        </form>
      </section>
    </div>
  );
}

function LogDialog({ site, onClose }: { site: Site; onClose: () => void }) {
  const [log, setLog] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filteredLog = useMemo(() => {
    const query = logQuery.trim().toLowerCase();
    if (!query) return { text: log, count: 0 };

    const lines = log.split(/\r?\n/).filter((line) => line.toLowerCase().includes(query));
    return { text: lines.join('\n'), count: lines.length };
  }, [log, logQuery]);

  useEffect(() => {
    let alive = true;

    async function loadLog() {
      setLoading(true);
      setError('');
      try {
        if (!window.kioskDesktop?.getSyslog) throw new Error('데스크톱 앱에서만 로그 보기를 사용할 수 있습니다.');
        const res = await window.kioskDesktop.getSyslog(site);
        if (alive) setLog(res.log || '');
      } catch (loadError) {
        if (alive) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadLog();
    return () => {
      alive = false;
    };
    // 자동검사로 인한 site 객체 참조 변경만으로는 재조회하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id, site.ip, site.basePort]);

  const backdrop = useModalBackdrop(onClose);

  return (
    <div className="modal-backdrop" {...backdrop}>
      <section className="log-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="memo-header">
          <div>
            <h3>{getSiteName(site)} 로그</h3>
            <p>{isTunnelConnection(site) ? '터널 연결 · SSH' : `${site.ip} · SSH`}</p>
          </div>
          <button type="button" className="memo-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        {loading && <div className="memo-empty">로그를 불러오는 중입니다.</div>}
        {error && <div className="memo-error">{error}</div>}
        {!loading && !error && (
          <>
            <div className="log-search">
              <input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder="로그 검색" />
              <span>{logQuery.trim() ? `${filteredLog.count}개` : '전체'}</span>
            </div>
            <pre className="log-content">{filteredLog.text || '검색 결과가 없습니다.'}</pre>
          </>
        )}
      </section>
    </div>
  );
}

type CropBox = Pick<CropChannel, 'cropLeft' | 'cropTop' | 'cropWidth' | 'cropHeight'>;
type CropDragMode = 'move' | 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';
type CropPhase = 'idle' | 'preparing' | 'saving' | 'restoring';

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapCropValue(value: number) {
  return Math.round(value / CROP_SNAP) * CROP_SNAP;
}

function normalizeCropBox(box: CropBox): CropBox {
  const cropLeft = clampNumber(snapCropValue(box.cropLeft), 0, CROP_NATIVE_WIDTH - CROP_MIN_SIZE);
  const cropTop = clampNumber(snapCropValue(box.cropTop), 0, CROP_NATIVE_HEIGHT - CROP_MIN_SIZE);
  const cropWidth = clampNumber(snapCropValue(box.cropWidth), CROP_MIN_SIZE, CROP_NATIVE_WIDTH - cropLeft);
  const cropHeight = clampNumber(snapCropValue(box.cropHeight), CROP_MIN_SIZE, CROP_NATIVE_HEIGHT - cropTop);

  return { cropLeft, cropTop, cropWidth, cropHeight };
}

function getEditableCropChannel(channels: CropChannel[]) {
  return channels.find((channel) => channel.channelId === 0) || channels[0] || null;
}

function updateEditableCropChannel(
  channels: CropChannel[],
  updater: (channel: CropChannel) => CropChannel,
) {
  const targetIndex = channels.findIndex((channel) => channel.channelId === 0);
  const index = targetIndex >= 0 ? targetIndex : 0;

  return channels.map((channel, channelIndex) => (
    channelIndex === index ? updater(channel) : channel
  ));
}

function CropVideoEditor({
  site,
  channel,
  disabled,
  onChange,
}: {
  site: Site;
  channel: CropChannel;
  disabled: boolean;
  onChange: (box: CropBox) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mutedRef = useRef(true);
  const dragRef = useRef<{
    mode: CropDragMode;
    startX: number;
    startY: number;
    startBox: CropBox;
  } | null>(null);
  const [streamError, setStreamError] = useState('녹화기 화면 연결 중');
  const streamReady = useGoRtcSiteStream(site, setStreamError);

  useGoRtcStream(`site_${site.id}`, videoRef, setStreamError, mutedRef, streamReady);

  const box = normalizeCropBox(channel);
  const leftPct = (box.cropLeft / CROP_NATIVE_WIDTH) * 100;
  const topPct = (box.cropTop / CROP_NATIVE_HEIGHT) * 100;
  const widthPct = (box.cropWidth / CROP_NATIVE_WIDTH) * 100;
  const heightPct = (box.cropHeight / CROP_NATIVE_HEIGHT) * 100;
  const rightPct = 100 - leftPct - widthPct;
  const bottomPct = 100 - topPct - heightPct;

  const updateFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || disabled) return;

    const rect = stage.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * CROP_NATIVE_WIDTH;
    const dy = ((event.clientY - drag.startY) / rect.height) * CROP_NATIVE_HEIGHT;
    let left = drag.startBox.cropLeft;
    let top = drag.startBox.cropTop;
    let right = drag.startBox.cropLeft + drag.startBox.cropWidth;
    let bottom = drag.startBox.cropTop + drag.startBox.cropHeight;

    if (drag.mode === 'move') {
      const width = right - left;
      const height = bottom - top;
      left = clampNumber(snapCropValue(drag.startBox.cropLeft + dx), 0, CROP_NATIVE_WIDTH - width);
      top = clampNumber(snapCropValue(drag.startBox.cropTop + dy), 0, CROP_NATIVE_HEIGHT - height);
      right = left + width;
      bottom = top + height;
    } else {
      if (drag.mode.includes('w')) left = clampNumber(snapCropValue(left + dx), 0, right - CROP_MIN_SIZE);
      if (drag.mode.includes('e')) right = clampNumber(snapCropValue(right + dx), left + CROP_MIN_SIZE, CROP_NATIVE_WIDTH);
      if (drag.mode.includes('n')) top = clampNumber(snapCropValue(top + dy), 0, bottom - CROP_MIN_SIZE);
      if (drag.mode.includes('s')) bottom = clampNumber(snapCropValue(bottom + dy), top + CROP_MIN_SIZE, CROP_NATIVE_HEIGHT);
    }

    onChange({
      cropLeft: left,
      cropTop: top,
      cropWidth: right - left,
      cropHeight: bottom - top,
    });
  }, [disabled, onChange]);

  function startDrag(mode: CropDragMode, event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startBox: box,
    };
  }

  function stopDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  return (
    <div className={`crop-video-editor ${disabled ? 'disabled' : ''}`}>
      <video ref={videoRef} autoPlay playsInline muted />
      {streamError && <p className="crop-stream-error">{streamError}</p>}
      <div
        ref={stageRef}
        className="crop-overlay"
        onPointerMove={updateFromPointer}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="crop-mask top" style={{ height: `${topPct}%` }} />
        <div className="crop-mask bottom" style={{ top: `${topPct + heightPct}%`, height: `${bottomPct}%` }} />
        <div className="crop-mask left" style={{ top: `${topPct}%`, width: `${leftPct}%`, height: `${heightPct}%` }} />
        <div className="crop-mask right" style={{ top: `${topPct}%`, left: `${leftPct + widthPct}%`, width: `${rightPct}%`, height: `${heightPct}%` }} />
        <div
          className="crop-box"
          style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%` }}
          onPointerDown={(event) => startDrag('move', event)}
        >
          {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as CropDragMode[]).map((mode) => (
            <div
              key={mode}
              className={`crop-handle ${mode}`}
              onPointerDown={(event) => startDrag(mode, event)}
            />
          ))}
          <span>{box.cropWidth} × {box.cropHeight}</span>
        </div>
      </div>
    </div>
  );
}

function CropDialog({ site, onClose }: { site: Site; onClose: () => void }) {
  const [channels, setChannels] = useState<CropChannel[]>([]);
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<CropPhase>('idle');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [restoreSnapshot, setRestoreSnapshot] = useState<{ channels: CropChannel[]; raw: string } | null>(null);
  const channel = useMemo(() => getEditableCropChannel(channels), [channels]);
  const busy = loading || phase !== 'idle';

  const loadCrop = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!window.kioskDesktop?.getCrop) throw new Error('데스크톱 앱에서만 크롭 설정을 사용할 수 있습니다.');
      const res = await window.kioskDesktop.getCrop(site);
      const nextChannel = getEditableCropChannel(res.channels);
      setChannels(res.channels);
      setRaw(res.raw);
      setEditing(nextChannel?.cropUse === 0);
      setRestoreSnapshot(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
    // 자동검사로 site 참조가 바뀔 때마다 편집 중인 크롭 값이 서버값으로 덮어써지는 것을 방지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id, site.ip, site.basePort]);

  useEffect(() => {
    loadCrop();
    // 최초 진입시 1회만 로드. loadCrop 재생성(위 의존성 변경) 시에만 다시 로드.
  }, [loadCrop]);

  function updateCropBox(box: CropBox) {
    setChannels((current) => updateEditableCropChannel(current, (currentChannel) => ({
      ...currentChannel,
      ...normalizeCropBox(box),
      cropUse: 1,
    })));
  }

  async function startEdit() {
    if (!channel) return;
    setError('');

    if (channel.cropUse === 0) {
      setEditing(true);
      return;
    }

    setPhase('preparing');
    try {
      if (!window.kioskDesktop?.saveCrop) throw new Error('데스크톱 앱에서만 크롭 저장을 사용할 수 있습니다.');
      const snapshot = { channels, raw };
      const nextChannels = updateEditableCropChannel(channels, (currentChannel) => ({
        ...currentChannel,
        cropUse: 0,
      }));
      await window.kioskDesktop.saveCrop({ site, channels: nextChannels, raw });
      setRestoreSnapshot(snapshot);
      setChannels(nextChannels);
      setEditing(true);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : String(startError));
    } finally {
      setPhase('idle');
    }
  }

  async function saveCrop() {
    if (!channel) return;

    setPhase('saving');
    setError('');
    try {
      if (!window.kioskDesktop?.saveCrop) throw new Error('데스크톱 앱에서만 크롭 저장을 사용할 수 있습니다.');
      const nextChannels = updateEditableCropChannel(channels, (currentChannel) => {
        const box = normalizeCropBox(currentChannel);
        // 박스가 전체 프레임(1920x1080)이면 실질적으로 크롭 안 한 것과 같으므로 cropUse를 꺼둔다.
        const isFullFrame = box.cropLeft === 0 && box.cropTop === 0
          && box.cropWidth === CROP_NATIVE_WIDTH && box.cropHeight === CROP_NATIVE_HEIGHT;
        return {
          ...currentChannel,
          ...box,
          cropUse: isFullFrame ? 0 : 1,
        };
      });
      await window.kioskDesktop.saveCrop({ site, channels: nextChannels, raw });
      setRestoreSnapshot(null);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setPhase('idle');
    }
  }

  async function closeCrop() {
    if (busy) return;
    if (restoreSnapshot) {
      setPhase('restoring');
      setError('');
      try {
        if (!window.kioskDesktop?.saveCrop) throw new Error('데스크톱 앱에서만 크롭 저장을 사용할 수 있습니다.');
        await window.kioskDesktop.saveCrop({ site, channels: restoreSnapshot.channels, raw: restoreSnapshot.raw });
        setRestoreSnapshot(null);
      } catch (restoreError) {
        setError(restoreError instanceof Error ? restoreError.message : String(restoreError));
        setPhase('idle');
        return;
      }
    }
    onClose();
  }

  const phaseText: Record<CropPhase, string> = {
    idle: '',
    preparing: '크롭을 잠시 해제하고 녹화기를 재부팅하고 있습니다.',
    saving: '크롭 설정을 저장하고 녹화기를 재부팅하고 있습니다.',
    restoring: '기존 크롭 설정으로 복원하고 녹화기를 재부팅하고 있습니다.',
  };
  const backdrop = useModalBackdrop(() => { void closeCrop(); }, busy);

  return (
    <div className="modal-backdrop" {...backdrop}>
      <section className="crop-dialog crop-editor-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="memo-header">
          <div>
            <h3>{getSiteName(site)} 크롭 설정</h3>
            <p>{isTunnelConnection(site) ? '터널 연결 · 채널 0 · 저장하면 SSH reboot가 실행됩니다.' : `${site.ip} · 채널 0 · 저장하면 SSH reboot가 실행됩니다.`}</p>
          </div>
          <button type="button" className="memo-close" onClick={closeCrop} disabled={busy} aria-label="닫기">×</button>
        </header>

        {error && <div className="memo-error">{error}</div>}
        {phase !== 'idle' && <div className="memo-empty">{phaseText[phase]}</div>}
        {loading && <div className="memo-empty">크롭 설정을 불러오는 중입니다.</div>}

        {!loading && !channel && <div className="memo-empty">채널 0 크롭 정보를 찾지 못했습니다.</div>}

        {!loading && channel && (
          <div className="crop-editor-body">
            <div className={`crop-state-panel ${editing ? 'editing' : 'locked'}`}>
              <div>
                <strong>{editing ? '영역 조정 가능' : '크롭 사용 중'}</strong>
                <p>
                  {editing
                    ? '녹화기 화면 위 박스를 드래그해서 실제로 남길 영역을 맞추세요.'
                    : '크롭을 잠시 해제한 뒤 녹화기 화면 기준으로 영역을 다시 잡을 수 있습니다.'}
                </p>
              </div>
              {!editing && (
                <button type="button" onClick={startEdit} disabled={busy}>
                  크롭 수정
                </button>
              )}
            </div>

            <CropVideoEditor
              site={site}
              channel={channel}
              disabled={!editing || busy}
              onChange={updateCropBox}
            />

            <div className="crop-editor-meta">
              <span>Left {normalizeCropBox(channel).cropLeft}</span>
              <span>Top {normalizeCropBox(channel).cropTop}</span>
              <span>Width {normalizeCropBox(channel).cropWidth}</span>
              <span>Height {normalizeCropBox(channel).cropHeight}</span>
            </div>
          </div>
        )}

        <footer className="dialog-actions">
          <button type="button" onClick={closeCrop} disabled={busy}>닫기</button>
          {!editing && channel?.cropUse === 1 ? (
            <button type="button" className="primary" onClick={startEdit} disabled={busy}>
              크롭 수정
            </button>
          ) : (
            <button type="button" className="primary" onClick={saveCrop} disabled={busy || !channel || !editing}>
              저장
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function getUpdateStatusLabel(info: AppUpdateInfo) {
  if (info.status === 'checking') return '업데이트 확인 중';
  if (info.status === 'latest') return '최신 버전';
  if (info.status === 'available') return info.availableVersion ? `v${info.availableVersion} 업데이트 가능` : '업데이트 가능';
  if (info.status === 'downloading') {
    return info.downloadPercent === null ? '업데이트 다운로드 중' : `다운로드 ${Math.round(info.downloadPercent)}%`;
  }

  if (info.status === 'downloaded') return '설치 준비 완료';
  if (info.status === 'error') return '업데이트 확인 실패';
  return '';
}

function SiteComboInput({
  value,
  options,
  placeholder,
  onChange,
  required,
}: {
  value: string;
  options: { id: string; name: string }[];
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);

  const updateMenuRect = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    setMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuRect();

    function closeOnOutside(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updateMenuRect);
    window.addEventListener('scroll', updateMenuRect, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updateMenuRect);
      window.removeEventListener('scroll', updateMenuRect, true);
    };
  }, [open, updateMenuRect]);

  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const candidates = query
      ? options.filter((option) => option.name.toLowerCase().includes(query))
      : options;
    return candidates.slice(0, 80);
  }, [options, value]);

  return (
    <div className="site-combo" ref={wrapperRef}>
      <div className="site-combo-control">
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          required={required}
        />
        <button type="button" aria-label="학원 목록 열기" onClick={() => setOpen((current) => !current)}>
          ▾
        </button>
      </div>
      {open && (
        <div className="site-combo-menu" style={menuRect}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.name);
                  setOpen(false);
                }}
              >
                {option.name}
              </button>
            ))
          ) : (
            <span>새 학원명으로 저장됩니다</span>
          )}
        </div>
      )}
    </div>
  );
}

function SiteSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  const updateMenuRect = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    setMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuRect();

    function closeOnOutside(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updateMenuRect);
    window.addEventListener('scroll', updateMenuRect, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updateMenuRect);
      window.removeEventListener('scroll', updateMenuRect, true);
    };
  }, [open, updateMenuRect]);

  return (
    <div className="site-combo" ref={wrapperRef}>
      <button type="button" className="site-select-trigger" onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label || '선택'}</span>
        <em>▾</em>
      </button>
      {open && (
        <div className="site-combo-menu compact" style={menuRect}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === value ? 'active' : ''}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SiteFormDialog({
  site,
  academies,
  tunnelEnabled,
  onClose,
  onSaved,
}: {
  site?: Site;
  academies: { id: string; name: string }[];
  tunnelEnabled: boolean;
  onClose: () => void;
  onSaved: (site: Site) => void;
}) {
  const editing = Boolean(site);
  const initialAcademyName = site?.academyName
    || academies.find((academy) => academy.id === site?.academyId)?.name
    || academies[0]?.name
    || '';
  const [draft, setDraft] = useState({
    building: site?.building || '',
    room: site?.room || '',
    ip: site?.ip || '',
    basePort: site ? String(site.basePort) : '',
    lanCidr: site?.lanCidr || '',
    nvrLocalIp: site?.nvrLocalIp || '',
    cameraLocalIp: site?.cameraLocalIp || '',
    cameraType: site?.cameraType || 'g320',
    phone: site?.phone || '',
    installedAt: site?.installedAt || '',
    quietFrom: site?.quietFrom || '',
    quietTo: site?.quietTo || '',
    cloudLearningMode: site?.cloudLearningMode === 'cloud' || site?.cloudLearningMode === 'local'
      ? site.cloudLearningMode
      : editing ? '' : 'local',
    cloudOrgCode: site?.cloudOrgCode || '',
  });
  const [localAcademies, setLocalAcademies] = useState<Academy[]>(academies);
  const [academyName, setAcademyName] = useState(initialAcademyName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLocalAcademies(academies);
    setAcademyName((current) => current || academies[0]?.name || '');
  }, [academies]);

  function updateDraft(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveSite(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const basePort = tunnelEnabled ? undefined : Number.parseInt(draft.basePort, 10);
      const normalizedAcademyName = academyName.trim();
      if (!normalizedAcademyName) throw new Error('학원을 입력하세요');
      if (!tunnelEnabled && !isValidSiteBasePort(basePort!)) {
        throw new Error(`Base Port는 0부터 ${MAX_SITE_BASE_PORT} 사이로 입력하세요`);
      }
      const lanCidr = draft.lanCidr.trim();
      const nvrLocalIp = draft.nvrLocalIp.trim();
      const cameraLocalIp = draft.cameraLocalIp.trim();
      if (!tunnelEnabled && lanCidr && !isValidPrivateIpv4Cidr(lanCidr)) {
        throw new Error('내부 LAN 대역은 192.168.0.0/24처럼 네트워크 주소로 입력하세요');
      }
      for (const [label, value] of tunnelEnabled ? [] : [['녹화기', nvrLocalIp], ['카메라', cameraLocalIp]] as const) {
        if (value && !isPrivateIpv4Address(value)) throw new Error(`${label} 내부 IP는 사설 IPv4로 입력하세요`);
        if (value && !lanCidr) throw new Error(`${label} 내부 IP를 쓰려면 내부 LAN 대역을 입력하세요`);
        if (value && lanCidr && !isIpv4InCidr(value, lanCidr)) {
          throw new Error(`${label} 내부 IP가 내부 LAN 대역에 포함되지 않습니다`);
        }
      }
      if (!tunnelEnabled && !['cloud', 'local'].includes(draft.cloudLearningMode)) {
        throw new Error('파일 전송 방식을 선택하세요');
      }
      const normalizedOrgCode = draft.cloudOrgCode.trim().toLowerCase();
      if (!tunnelEnabled && draft.cloudLearningMode === 'cloud' && !/^[a-z0-9_-]+$/.test(normalizedOrgCode)) {
        throw new Error('ORG 코드는 영문, 숫자, -, _ 조합으로 입력하세요');
      }

      const existingAcademy = localAcademies.find(
        (academy) => academy.name.trim().toLowerCase() === normalizedAcademyName.toLowerCase(),
      );
      const academy = existingAcademy
        ?? (await axios.post<Academy>(`${API_URL}/api/academies`, { name: normalizedAcademyName })).data;

      if (!existingAcademy) {
        setLocalAcademies((current) => [...current, academy].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')));
      }

      const payload = {
        ...draft,
        connectionMode: tunnelEnabled ? 'tunnel' : 'legacy',
        academyId: academy.id,
        basePort,
        ip: tunnelEnabled ? undefined : draft.ip,
        lanCidr: tunnelEnabled ? undefined : draft.lanCidr,
        nvrLocalIp: tunnelEnabled ? undefined : draft.nvrLocalIp,
        cameraLocalIp: tunnelEnabled ? undefined : draft.cameraLocalIp,
        installedAt: draft.installedAt || undefined,
        quietFrom: tunnelEnabled ? undefined : draft.quietFrom || undefined,
        quietTo: tunnelEnabled && !editing ? undefined : draft.quietTo || undefined,
        cloudLearningMode: tunnelEnabled ? undefined : draft.cloudLearningMode as 'cloud' | 'local',
        cloudOrgCode: !tunnelEnabled && draft.cloudLearningMode === 'cloud' ? normalizedOrgCode : undefined,
      };
      const res = editing && site
        ? await axios.put<Site>(`${API_URL}/api/sites/${site.id}`, payload)
        : await axios.post<Site>(`${API_URL}/api/sites`, payload);
      onSaved(res.data);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  const backdrop = useModalBackdrop(onClose);

  return (
    <div className="modal-backdrop" {...backdrop}>
      <form className="site-edit-dialog" onSubmit={saveSite} onClick={(event) => event.stopPropagation()}>
        <header className="memo-header">
          <div>
            <h3>{editing ? '현장 수정' : '현장 추가'}</h3>
            <p>{editing && site ? getSiteName(site) : '새 현장 정보를 입력하세요'}</p>
          </div>
          <button type="button" className="memo-close" onClick={onClose} aria-label="닫기">×</button>
        </header>

        {error && <div className="memo-error">{error}</div>}

        <div className="site-edit-grid">
          <label>
            <span>학원</span>
            <SiteComboInput
              value={academyName}
              options={localAcademies}
              onChange={setAcademyName}
              placeholder="학원 선택 또는 새 학원명 입력"
              required
            />
          </label>
          <label>
            <span>건물</span>
            <input value={draft.building} onChange={(event) => updateDraft('building', event.target.value)} />
          </label>
          <label>
            <span>강의실</span>
            <input value={draft.room} onChange={(event) => updateDraft('room', event.target.value)} required />
          </label>
          {!tunnelEnabled && (
            <>
              <label>
                <span>IP</span>
                <input value={draft.ip} onChange={(event) => updateDraft('ip', event.target.value)} required />
              </label>
              <label>
                <span>Base Port</span>
                <input type="number" min="0" max={MAX_SITE_BASE_PORT} value={draft.basePort} onChange={(event) => updateDraft('basePort', event.target.value)} required />
              </label>
              <label>
                <span>내부 LAN 대역</span>
                <input value={draft.lanCidr} onChange={(event) => updateDraft('lanCidr', event.target.value)} placeholder="예: 192.168.0.0/24" />
              </label>
              <label>
                <span>녹화기 내부 IP</span>
                <input value={draft.nvrLocalIp} onChange={(event) => updateDraft('nvrLocalIp', event.target.value)} placeholder="예: 192.168.0.10" />
              </label>
              <label>
                <span>카메라 내부 IP</span>
                <input value={draft.cameraLocalIp} onChange={(event) => updateDraft('cameraLocalIp', event.target.value)} placeholder="예: 192.168.0.20" />
              </label>
            </>
          )}
          <label>
            <span>카메라 타입</span>
            <SiteSelect
              value={draft.cameraType}
              onChange={(value) => updateDraft('cameraType', value)}
              options={[
                { value: 'g320', label: 'G320' },
                { value: 'ltc2', label: 'LTC2' },
                { value: 'kato', label: 'KATO' },
              ]}
            />
          </label>
          <label>
            <span>전화번호</span>
            <input value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} />
          </label>
          <label>
            <span>설치일</span>
            <DatePicker label="설치일" value={draft.installedAt} onChange={(value) => updateDraft('installedAt', value)} />
          </label>
          {tunnelEnabled && editing && <label>
            <span>다시 켜지는 시각</span>
            <input type="time" value={draft.quietTo || '07:00'} onChange={(event) => updateDraft('quietTo', event.target.value)} />
          </label>}
          {!tunnelEnabled && <><label className="site-cloud-mode-field">
            <span>파일 전송</span>
            <div className="site-cloud-mode" role="group" aria-label="파일 전송 방식">
              <button
                type="button"
                className={draft.cloudLearningMode === 'local' ? 'active' : ''}
                onClick={() => setDraft((current) => ({ ...current, cloudLearningMode: 'local', cloudOrgCode: '' }))}
              >
                로컬
              </button>
              <button
                type="button"
                className={draft.cloudLearningMode === 'cloud' ? 'active' : ''}
                onClick={() => updateDraft('cloudLearningMode', 'cloud')}
              >
                클라우드러닝
              </button>
            </div>
          </label>
          {draft.cloudLearningMode === 'cloud' && (
            <label>
              <span>ORG 코드</span>
              <input
                value={draft.cloudOrgCode}
                onChange={(event) => updateDraft('cloudOrgCode', event.target.value)}
                placeholder="예: gakkin_hakwon"
                maxLength={100}
                required
              />
            </label>
          )}</>}
        </div>

        <footer className="dialog-actions">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? '저장 중' : '저장'}</button>
        </footer>
      </form>
    </div>
  );
}

function getLocalDateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatServiceDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getServiceTaskUser(task: ServiceTask, completed = false) {
  const name = completed ? task.completedByName : task.createdByName;
  const username = completed ? task.completedByUsername : task.createdByUsername;
  if (name && username) return `${name} (@${username})`;
  return name || (username ? `@${username}` : '알 수 없음');
}

function ServiceTaskDialog({ site, onClose }: { site: Site; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [contactPhone, setContactPhone] = useState(site.phone || '');
  const [academyAddress, setAcademyAddress] = useState('');
  const [scheduledFor, setScheduledFor] = useState(getLocalDateInputValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const backdrop = useModalBackdrop(onClose);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason || !scheduledFor) return;

    setSaving(true);
    setError('');
    try {
      await axios.post(`${API_URL}/api/sites/${site.id}/service-tasks`, {
        reason: normalizedReason,
        contactPhone: contactPhone.trim() || undefined,
        academyAddress: academyAddress.trim() || undefined,
        scheduledFor,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdrop}>
      <form className="service-task-dialog" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <header className="memo-header">
          <div>
            <h3>AS 목록 추가</h3>
            <p>{site.academyName} · {getSiteName(site)}</p>
          </div>
          <button type="button" className="memo-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="service-task-form">
          <label>
            <span>AS 사유</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="점검이나 조치가 필요한 내용을 입력하세요"
              maxLength={1000}
              required
              autoFocus
            />
          </label>
          <label>
            <span>조치 예정일</span>
            <input
              type="date"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
              required
            />
          </label>
          <label>
            <span>담당자 번호</span>
            <input
              type="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="예: 010-1234-5678"
              maxLength={50}
            />
          </label>
          <label>
            <span>학원 주소</span>
            <input
              value={academyAddress}
              onChange={(event) => setAcademyAddress(event.target.value)}
              placeholder="방문할 학원 주소를 입력하세요"
              maxLength={500}
            />
          </label>
          {error && <div className="memo-error">{error}</div>}
        </div>
        <footer className="dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>취소</button>
          <button type="submit" className="primary" disabled={saving || !reason.trim() || !scheduledFor}>
            {saving ? '추가 중' : 'AS 목록 추가'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ServiceTaskCompleteDialog({
  task,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  task: ServiceTask;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (problemDescription: string, resolutionDescription: string) => void;
}) {
  const [problemDescription, setProblemDescription] = useState('');
  const [resolutionDescription, setResolutionDescription] = useState('');
  const backdrop = useModalBackdrop(onClose);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedProblem = problemDescription.trim();
    const normalizedResolution = resolutionDescription.trim();
    if (!normalizedProblem || !normalizedResolution) return;
    onSubmit(normalizedProblem, normalizedResolution);
  }

  return (
    <div className="modal-backdrop" {...backdrop}>
      <form className="service-task-dialog" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <header className="memo-header">
          <div>
            <h3>AS 조치 완료</h3>
            <p>{task.academyName} · {[task.building, task.room].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" className="memo-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="service-task-form">
          <label>
            <span>문제 내용</span>
            <textarea
              value={problemDescription}
              onChange={(event) => setProblemDescription(event.target.value)}
              placeholder="어떤 문제가 있었는지 입력하세요"
              maxLength={1000}
              required
              autoFocus
            />
          </label>
          <label>
            <span>조치 내용</span>
            <textarea
              value={resolutionDescription}
              onChange={(event) => setResolutionDescription(event.target.value)}
              placeholder="어떻게 조치해서 해결했는지 입력하세요"
              maxLength={1000}
              required
            />
          </label>
          {error && <div className="memo-error">{error}</div>}
        </div>
        <footer className="dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>취소</button>
          <button
            type="submit"
            className="primary"
            disabled={saving || !problemDescription.trim() || !resolutionDescription.trim()}
          >
            {saving ? '처리 중' : '완료 처리'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ServiceTaskEditDialog({
  task,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  task: ServiceTask;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: {
    reason: string;
    contactPhone?: string;
    academyAddress?: string;
    scheduledFor: string;
    problemDescription?: string;
    resolutionDescription?: string;
  }) => void;
}) {
  const [reason, setReason] = useState(task.reason);
  const [contactPhone, setContactPhone] = useState(task.contactPhone || '');
  const [academyAddress, setAcademyAddress] = useState(task.academyAddress || '');
  const [scheduledFor, setScheduledFor] = useState(task.scheduledFor);
  const [problemDescription, setProblemDescription] = useState(task.problemDescription || '');
  const [resolutionDescription, setResolutionDescription] = useState(task.resolutionDescription || '');
  const backdrop = useModalBackdrop(onClose);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason || !scheduledFor) return;

    onSubmit({
      reason: normalizedReason,
      contactPhone: contactPhone.trim() || undefined,
      academyAddress: academyAddress.trim() || undefined,
      scheduledFor,
      problemDescription: problemDescription.trim() || undefined,
      resolutionDescription: resolutionDescription.trim() || undefined,
    });
  }

  return (
    <div className="modal-backdrop" {...backdrop}>
      <form className="service-task-dialog" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <header className="memo-header">
          <div>
            <h3>AS 내용 수정</h3>
            <p>{task.academyName} · {[task.building, task.room].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" className="memo-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="service-task-form service-task-form-scroll">
          <label>
            <span>AS 사유</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="점검이나 조치가 필요한 내용을 입력하세요"
              maxLength={1000}
              required
              autoFocus
            />
          </label>
          <label>
            <span>조치 예정일</span>
            <input
              type="date"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
              required
            />
          </label>
          <label>
            <span>담당자 번호</span>
            <input
              type="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="예: 010-1234-5678"
              maxLength={50}
            />
          </label>
          <label>
            <span>학원 주소</span>
            <input
              value={academyAddress}
              onChange={(event) => setAcademyAddress(event.target.value)}
              placeholder="방문할 학원 주소를 입력하세요"
              maxLength={500}
            />
          </label>
          <label>
            <span>문제 내용</span>
            <textarea
              value={problemDescription}
              onChange={(event) => setProblemDescription(event.target.value)}
              placeholder="어떤 문제가 있었는지 입력하세요"
              maxLength={1000}
            />
          </label>
          <label>
            <span>조치 내용</span>
            <textarea
              value={resolutionDescription}
              onChange={(event) => setResolutionDescription(event.target.value)}
              placeholder="어떻게 조치했는지 입력하세요"
              maxLength={1000}
            />
          </label>
          {error && <div className="memo-error">{error}</div>}
        </div>
        <footer className="dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>취소</button>
          <button type="submit" className="primary" disabled={saving || !reason.trim() || !scheduledFor}>
            {saving ? '저장 중' : '저장'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ServiceTasksView({ currentUser, refreshVersion }: { currentUser: AuthUser; refreshVersion: number }) {
  const dialog = useAppDialog();
  const [tasks, setTasks] = useState<ServiceTask[]>([]);
  const [status, setStatus] = useState<'pending' | 'completed'>('pending');
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState({ pending: 0, completed: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [requestVersion, setRequestVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completingId, setCompletingId] = useState<string>();
  const [completionError, setCompletionError] = useState('');
  const [completionTarget, setCompletionTarget] = useState<ServiceTask | null>(null);
  const [editingId, setEditingId] = useState<string>();
  const [editError, setEditError] = useState('');
  const [editTarget, setEditTarget] = useState<ServiceTask | null>(null);
  const [deletingId, setDeletingId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      axios.get<ServiceTaskListResponse>(`${API_URL}/api/service-tasks/paged`, {
        params: { status, page, pageSize: 50, query: query.trim() || undefined },
        signal: controller.signal,
      })
        .then((response) => {
          setTasks(response.data.items);
          setCounts(response.data.counts);
          setTotalPages(response.data.totalPages);
          if (response.data.page > response.data.totalPages) setPage(response.data.totalPages);
        })
        .catch((loadError) => {
          if (!axios.isCancel(loadError)) setError(loadError instanceof Error ? loadError.message : String(loadError));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, query, refreshVersion, requestVersion, status]);

  useEffect(() => setPage(1), [query, status]);

  async function submitComplete(task: ServiceTask, problemDescription: string, resolutionDescription: string) {
    setCompletingId(task.id);
    setCompletionError('');
    try {
      const response = await axios.put<ServiceTask>(`${API_URL}/api/service-tasks/${task.id}/complete`, {
        problemDescription,
        resolutionDescription,
      });
      setTasks((current) => current.filter((item) => item.id !== response.data.id));
      setCounts((current) => ({ pending: Math.max(0, current.pending - 1), completed: current.completed + 1 }));
      setCompletionTarget(null);
      setRequestVersion((current) => current + 1);
    } catch (completeError) {
      setCompletionError(completeError instanceof Error ? completeError.message : String(completeError));
    } finally {
      setCompletingId(undefined);
    }
  }

  async function handleDelete(task: ServiceTask) {
    if (!await dialog.confirm({
      title: 'AS 완료 이력 삭제',
      message: `${task.academyName} ${task.room}의 완료 이력을 영구 삭제할까요?`,
      confirmText: '삭제',
      tone: 'danger',
    })) return;

    setDeletingId(task.id);
    try {
      await axios.delete(`${API_URL}/api/service-tasks/${task.id}`);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setCounts((current) => ({ ...current, completed: Math.max(0, current.completed - 1) }));
      setRequestVersion((current) => current + 1);
    } catch (deleteError) {
      await dialog.alert({
        title: 'AS 이력 삭제 실패',
        message: deleteError instanceof Error ? deleteError.message : String(deleteError),
      });
    } finally {
      setDeletingId(undefined);
    }
  }

  async function submitEdit(
    task: ServiceTask,
    payload: {
      reason: string;
      contactPhone?: string;
      academyAddress?: string;
      scheduledFor: string;
      problemDescription?: string;
      resolutionDescription?: string;
    },
  ) {
    setEditingId(task.id);
    setEditError('');
    try {
      const response = await axios.patch<ServiceTask>(`${API_URL}/api/service-tasks/${task.id}`, payload);
      setTasks((current) => current.map((item) => (item.id === response.data.id ? response.data : item)));
      setEditTarget(null);
      setRequestVersion((current) => current + 1);
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setEditingId(undefined);
    }
  }

  return (
    <section className="service-tasks-view">
      <div className="service-task-toolbar">
        <div className="service-task-tabs" role="tablist" aria-label="AS 상태">
          <button type="button" className={status === 'pending' ? 'active' : ''} onClick={() => setStatus('pending')}>
            대기 <strong>{counts.pending}</strong>
          </button>
          <button type="button" className={status === 'completed' ? 'active' : ''} onClick={() => setStatus('completed')}>
            완료 <strong>{counts.completed}</strong>
          </button>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="학원, 강의실, AS 사유 검색" />
      </div>

      <div className="service-task-list">
        <div className="service-task-row service-task-row-header" aria-hidden="true">
          <span>학원 · 강의실</span>
          <span>AS 사유</span>
          <span>{status === 'pending' ? '조치 예정일' : '완료일'}</span>
          <span>{status === 'pending' ? '등록자' : '완료자'}</span>
          <span>작업</span>
        </div>
        {loading && <div className="empty-state">AS 목록을 불러오는 중입니다.</div>}
        {error && <div className="error-box">AS 목록 조회 실패: {error}</div>}
        {!loading && !error && tasks.map((task) => (
          <article key={task.id} className="service-task-row">
            <div className="service-task-site">
              <strong>{task.academyName}</strong>
              <span>{[task.building, task.room].filter(Boolean).join(' · ')}</span>
              {task.academyAddress && <span title={task.academyAddress}>{task.academyAddress}</span>}
            </div>
            <div className="service-task-reason">
              <p>{task.reason}</p>
              {task.contactPhone && <span>담당자 {task.contactPhone}</span>}
              {status === 'completed' && (task.problemDescription || task.resolutionDescription) && (
                <dl className="service-task-resolution">
                  {task.problemDescription && (
                    <>
                      <dt>문제</dt>
                      <dd>{task.problemDescription}</dd>
                    </>
                  )}
                  {task.resolutionDescription && (
                    <>
                      <dt>조치</dt>
                      <dd>{task.resolutionDescription}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>
            <time>{formatServiceDate(status === 'pending' ? task.scheduledFor : (task.completedAt || task.scheduledFor).slice(0, 10))}</time>
            <span>{getServiceTaskUser(task, status === 'completed')}</span>
            <div className="service-task-action">
              {status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="service-task-edit"
                    onClick={() => {
                      setEditError('');
                      setEditTarget(task);
                    }}
                    disabled={editingId === task.id}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCompletionError('');
                      setCompletionTarget(task);
                    }}
                    disabled={completingId === task.id}
                  >
                    <CheckCircle2 size={15} />{completingId === task.id ? '처리 중' : '조치 완료'}
                  </button>
                </>
              ) : (
                <>
                  <span className="service-task-complete"><CheckCircle2 size={15} />완료</span>
                  <button
                    type="button"
                    className="service-task-edit"
                    onClick={() => {
                      setEditError('');
                      setEditTarget(task);
                    }}
                    disabled={editingId === task.id}
                  >
                    {editingId === task.id ? '저장 중' : '수정'}
                  </button>
                  {currentUser.role === 'admin' && (
                    <button
                      type="button"
                      className="service-task-delete"
                      onClick={() => handleDelete(task)}
                      disabled={deletingId === task.id}
                    >
                      <Trash2 size={14} />{deletingId === task.id ? '삭제 중' : '삭제'}
                    </button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        {!loading && !error && tasks.length === 0 && (
          <div className="empty-state">{status === 'pending' ? '대기 중인 AS가 없습니다.' : '완료된 AS 이력이 없습니다.'}</div>
        )}
      </div>
      {totalPages > 1 && (
        <nav className="service-task-pagination" aria-label="AS 이력 페이지">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading}>이전</button>
          <span>{page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages || loading}>다음</button>
        </nav>
      )}
      {completionTarget && (
        <ServiceTaskCompleteDialog
          task={completionTarget}
          saving={completingId === completionTarget.id}
          error={completionError}
          onClose={() => {
            if (completingId) return;
            setCompletionError('');
            setCompletionTarget(null);
          }}
          onSubmit={(problemDescription, resolutionDescription) => {
            void submitComplete(completionTarget, problemDescription, resolutionDescription);
          }}
        />
      )}
      {editTarget && (
        <ServiceTaskEditDialog
          key={editTarget.id}
          task={editTarget}
          saving={editingId === editTarget.id}
          error={editError}
          onClose={() => {
            if (editingId) return;
            setEditError('');
            setEditTarget(null);
          }}
          onSubmit={(payload) => {
            void submitEdit(editTarget, payload);
          }}
        />
      )}
    </section>
  );
}

function FilesDialog({
  site,
  initialPath = '/',
  onClose,
  onDownloadFile,
  onUploadFiles,
  onUploadDroppedFiles,
  onDragDownload,
}: {
  site: SiteConnectionContext;
  initialPath?: string;
  onClose: () => void;
  onDownloadFile: (site: Site, item: SiteFileItem, currentPath: string) => Promise<void>;
  onUploadFiles: (site: Site, currentPath: string) => Promise<void>;
  onUploadDroppedFiles: (site: Site, currentPath: string, files: File[]) => Promise<void>;
  onDragDownload: (site: Site, item: SiteFileItem, currentPath: string) => Promise<void>;
}) {
  const { currentPath, items, loading, error, setError, loadFiles } = useFileBrowser(site, API_URL, initialPath);
  const [treeRevision, setTreeRevision] = useState(0);
  const deletion = useFileDeletion({ source: 'recorder', site, apiUrl: API_URL, refresh: async () => {
    // 부분 삭제도 폴더 구성을 바꾸므로 캐시된 트리를 함께 비운다.
    setTreeRevision(previous => previous + 1);
    await loadFiles(currentPath);
  } });
  const deleting = Boolean(deletion.target);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [view, setView] = useState<'icons' | 'details'>('details');
  const [fileSort, setFileSort] = useState<FileSort>({ field: 'name', descending: false });
  const sortedItems = useMemo(() => sortFileItems(items, fileSort), [items, fileSort]);
  const [navigation, setNavigation] = useState({ paths: [initialPath], index: 0 });
  const loadTreeChildren = useCallback(async (path: string): Promise<FolderTreeItem[]> => {
    const listing = window.kioskDesktop?.listFiles
      ? await window.kioskDesktop.listFiles({ site, path })
      : (await axios.get<SiteFileList>(`${API_URL}/api/sites/${site.id}/files`, { params: { path }, timeout: 10_000 })).data;
    return listing.items.filter(item => item.isDirectory).map(item => ({ path: joinFilePath(listing.path, item.name), name: item.name }));
  }, [site]);

  async function navigate(path: string, mode: 'push' | 'jump' = 'push', index?: number) {
    if (deleting) return;
    const loaded = await loadFiles(path);
    if (!loaded) return;
    setSelectedPath('');
    if (mode === 'jump' && index !== undefined) setNavigation(previous => ({ ...previous, index }));
    else setNavigation(previous => previous.paths[previous.index] === loaded ? previous : {
      paths: [...previous.paths.slice(0, previous.index + 1), loaded], index: previous.index + 1,
    });
  }
  useEffect(() => {
    if (!window.kioskDesktop?.onUploadCompleted) return undefined;
    return window.kioskDesktop.onUploadCompleted((payload) => {
      if (payload.siteId === site.id && normalizeFilePath(payload.remoteDir) === normalizeFilePath(currentPath)) {
        void loadFiles(currentPath);
      }
    });
  }, [currentPath, loadFiles, site.id]);

  function hasDroppedFiles(dataTransfer: DataTransfer) {
    return Array.from(dataTransfer.types).includes('Files');
  }

  function handleDragOver(event: React.DragEvent, targetPath: string) {
    if (!hasDroppedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDropTarget(targetPath);
  }

  function handleDragLeave(event: React.DragEvent, targetPath: string) {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    if (dropTarget === targetPath) setDropTarget(null);
  }

  async function handleFileDrop(event: React.DragEvent, targetPath: string) {
    if (!hasDroppedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    await uploadDroppedFiles(targetPath, files);
  }

  async function uploadDroppedFiles(targetPath: string, files: File[]) {
    if (deleting) return;
    setError('');
    try {
      await onUploadDroppedFiles(site, targetPath, files);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    }
  }

  const folderCount = items.filter((item) => item.isDirectory).length;
  const fileCount = items.length - folderCount;
  const selectedItem = items.find(item => joinFilePath(currentPath, item.name) === selectedPath);
  const parts = normalizeFilePath(currentPath).split('/').filter(Boolean);
  const crumbs = [{ path: '/', label: '녹화기' }, ...parts.map((part, index) => ({ path: `/${parts.slice(0, index + 1).join('/')}`, label: part }))];
  const backdrop = useModalBackdrop(onClose, deleting);

  function renderItem(item: SiteFileItem, details: boolean) {
    const path = joinFilePath(currentPath, item.name);
    return <button type="button" key={path}
      className={details ? 'pc-files-detail-name' : ['pc-files-tile', item.isDirectory ? 'folder' : 'file', selectedPath === path ? 'selected' : '', dropTarget === path ? 'drop-target' : ''].join(' ')}
      onClick={() => setSelectedPath(path)}
      onDoubleClick={() => item.isDirectory ? void navigate(path) : void onDownloadFile(site, item, currentPath)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); item.isDirectory ? void navigate(path) : void onDownloadFile(site, item, currentPath); } }}
      draggable={!item.isDirectory && Boolean(window.kioskDesktop?.prepareFileDrag)}
      onDragStart={!item.isDirectory ? event => { event.preventDefault(); void onDragDownload(site, item, currentPath); } : undefined}
      onDragOver={item.isDirectory ? event => handleDragOver(event, path) : undefined}
      onDragLeave={item.isDirectory ? event => handleDragLeave(event, path) : undefined}
      onDrop={item.isDirectory ? event => void handleFileDrop(event, path) : undefined}
      aria-label={`${item.name}, 두 번 클릭하여 ${item.isDirectory ? '열기' : '다운로드'}`} title={item.name}>
      <span className={details ? 'pc-files-detail-icon ' + (item.isDirectory ? 'folder' : 'file') : 'pc-files-tile-icon'}>
        {item.isDirectory ? <Folder size={details ? 17 : 38} /> : <File size={details ? 17 : 38} />}
      </span><span className={details ? '' : 'pc-files-tile-name'}>{item.name}</span>
    </button>;
  }

  return (
    <div className="modal-backdrop" {...backdrop}>
      {deletion.target && <DeleteItemsDialog key={deletion.target.path} deletion={deletion} passwordRequired />}
      <section inert={deleting} className="files-dialog pc-files-dialog" onClick={(event) => event.stopPropagation()} aria-label={`${getSiteName(site)} 녹화기 파일`}>
        <header className="files-header">
          <div>
            <h3>{getSiteName(site)} {isTunnelConnection(site) ? '녹화기 파일' : '파일 탐색'}</h3>
            <p>{isTunnelConnection(site) ? '터널 연결 · FTP' : `${site.ip} · FTP :${getPortNumber(site, 'ftp')}`}</p>
          </div>
          <div className="files-header-actions">
            <button type="button" className="upload-button" onClick={() => onUploadFiles(site, currentPath)} disabled={loading}><Upload size={14} />업로드</button>
            <button type="button" className="upload-button" onClick={() => selectedItem && onDownloadFile(site, selectedItem, currentPath)} disabled={loading || !selectedItem || selectedItem.isDirectory}><Download size={14} />다운로드</button>
            <button type="button" className="delete-file-button" onClick={() => selectedItem && void deletion.begin({ path: selectedPath, name: selectedItem.name, isDirectory: selectedItem.isDirectory })} disabled={loading || deleting || !selectedItem}><Trash2 size={14} />삭제</button>
            <button type="button" className="memo-close" disabled={deleting} onClick={onClose} aria-label="닫기"><X size={16} /></button>
          </div>
        </header>

        <nav className="pc-files-toolbar" aria-label="폴더 이동">
          <div className="pc-files-navigation">
            <button type="button" disabled={loading || navigation.index === 0} onClick={() => void navigate(navigation.paths[navigation.index - 1], 'jump', navigation.index - 1)} aria-label="뒤로"><ArrowLeft size={16} /></button>
            <button type="button" disabled={loading || navigation.index >= navigation.paths.length - 1} onClick={() => void navigate(navigation.paths[navigation.index + 1], 'jump', navigation.index + 1)} aria-label="앞으로"><ArrowRight size={16} /></button>
            <button type="button" disabled={loading || currentPath === '/'} onClick={() => void navigate(parentFilePath(currentPath))} aria-label="상위 폴더"><ArrowUp size={16} /></button>
          </div>
          <div className="pc-files-address" aria-label="현재 경로">{crumbs.map((crumb, index) => <button type="button" key={crumb.path} className={crumb.path === currentPath ? 'active' : ''} disabled={loading || crumb.path === currentPath} onClick={() => void navigate(crumb.path)}>{index > 0 && <span aria-hidden="true">›</span>}{crumb.label}</button>)}</div>
          <button type="button" className="pc-files-refresh" disabled={loading} onClick={() => void loadFiles(currentPath)} aria-label="새로고침"><RefreshCw size={16} /></button>
        </nav>
        <div className={error ? 'memo-error' : 'pc-files-message'} role={error ? 'alert' : 'status'}>{error || '\u00a0'}</div>
        <div className="pc-files-workspace">
          <FileFolderTree key={`${site.id}:${treeRevision}`} rootPath="/" rootLabel="녹화기" currentPath={currentPath} loadChildren={loadTreeChildren}
            onNavigate={path => void navigate(path)} onDropFiles={(path, files) => void uploadDroppedFiles(path, files)} />
          <div className="pc-files-main">
            <div className="pc-files-viewbar"><span>{currentPath === '/' ? '녹화기' : currentPath} <small>폴더 {folderCount}개 · 파일 {fileCount}개</small></span>
              <div role="group" aria-label="보기 방식"><button type="button" className={view === 'icons' ? 'active' : ''} onClick={() => setView('icons')} aria-label="아이콘 보기" aria-pressed={view === 'icons'}><LayoutGrid size={15} /></button><button type="button" className={view === 'details' ? 'active' : ''} onClick={() => setView('details')} aria-label="자세히 보기" aria-pressed={view === 'details'}><List size={16} /></button></div>
            </div>
            <div className={`pc-files-list${dropTarget === currentPath ? ' drop-target' : ''}`} aria-busy={loading}
              onDragOver={event => handleDragOver(event, currentPath)} onDragLeave={event => handleDragLeave(event, currentPath)} onDrop={event => void handleFileDrop(event, currentPath)}>
              {dropTarget === currentPath && <div className="pc-files-drop-indicator">현재 폴더에 업로드</div>}
              {view === 'icons' ? <div className="pc-files-grid">{sortedItems.map(item => renderItem(item, false))}</div>
                : <table className="pc-files-details"><thead><tr>{(['name', 'size', 'modifiedAt'] as const).map((field) => <th key={field} aria-sort={fileSort.field === field ? fileSort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" className="pc-files-sort" onClick={() => setFileSort(current => nextFileSort(current, field))}>{field === 'name' ? '이름' : field === 'size' ? '크기' : '수정일'}{fileSort.field === field && <span aria-hidden="true">{fileSort.descending ? ' ↓' : ' ↑'}</span>}</button></th>)}</tr></thead><tbody>{sortedItems.map(item => {
                  const path = joinFilePath(currentPath, item.name);
                  return <tr key={path} className={selectedPath === path ? 'selected' : ''}><td>{renderItem(item, true)}</td><td>{item.isDirectory ? '—' : formatFileSize(item.size)}</td><td>{formatFileDate(item.modifiedAt)}</td></tr>;
                })}</tbody></table>}
              {!loading && !error && items.length === 0 && <div className="pc-files-empty">이 폴더에는 표시할 파일이 없습니다.</div>}
              {loading && items.length === 0 && <div className="pc-files-empty">파일 목록을 불러오는 중입니다.</div>}
            </div>
          </div>
        </div>
        <footer className="pc-files-footer"><span>{selectedItem ? selectedItem.name : '파일을 선택하면 다운로드하거나 삭제할 수 있습니다.'}</span><span>드래그로 업로드·다운로드</span></footer>
      </section>
    </div>
  );
}

function StreamTile({
  site,
  status,
  onClose,
  onFocus,
  featured = false,
}: {
  site: SiteConnectionContext;
  status?: SiteStatus;
  onClose: () => void;
  onFocus?: () => void;
  featured?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mutedRef = useRef(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const streamReady = useGoRtcSiteStream(site, setError);

  useGoRtcStream(`site_${site.id}`, videoRef, setError, mutedRef, streamReady);

  useEffect(() => { if (error) setPlaying(false); }, [error]);

  useEffect(() => {
    mutedRef.current = muted;
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted;
    const stream = video.srcObject;
    if (stream instanceof MediaStream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }, [muted]);

  return (
    <article className={`stream-tile ${featured ? 'featured' : ''}`}>
      <header>
        <div>
          <strong>{getSiteName(site)}</strong>
          <span>{site.academyName}{isTunnelConnection(site) ? '' : ` · ${site.ip}`}</span>
        </div>
        {status?.isRecording && <em>REC</em>}
        <button type="button" onClick={onClose} aria-label="닫기">×</button>
      </header>

      <div className="stream-video">
        {error && !playing && <p>{error}</p>}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onPlaying={() => setPlaying(true)}
          onWaiting={() => setPlaying(false)}
          onDoubleClick={() => onFocus?.()}
        />
        <button type="button" className="stream-mute" onClick={() => setMuted((value) => !value)}>
          {muted ? '소리 켜기' : '소리 끄기'}
        </button>
      </div>
    </article>
  );
}

function MonitoringView({
  sites,
  statuses,
  agentStatuses,
  tunnelEnabled,
  initialSiteId,
}: {
  sites: Site[];
  statuses: Record<string, SiteStatus>;
  agentStatuses: Record<string, SiteAgentStatus>;
  tunnelEnabled: boolean;
  initialSiteId?: string;
}) {
  const dialog = useAppDialog();
  const [search, setSearch] = useState('');
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [cols, setCols] = useState(4);
  const [focusedSiteId, setFocusedSiteId] = useState<string | null>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);

  const filteredSites = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return sites;

    return sites.filter((site) => [
      site.academyName,
      site.building,
      site.room,
      ...(tunnelEnabled ? [] : [site.ip]),
    ].some((value) => value?.toLowerCase().includes(text)));
  }, [search, sites, tunnelEnabled]);

  const groupedSites = useMemo(() => filteredSites.reduce<Record<string, Site[]>>((acc, site) => {
    if (!acc[site.academyName]) acc[site.academyName] = [];
    acc[site.academyName].push(site);
    return acc;
  }, {}), [filteredSites]);

  const siteMap = useMemo(() => new Map(sites.map((site) => [
    site.id,
    tunnelEnabled ? { ...site, agentStatus: agentStatuses[site.id] } : site,
  ])), [agentStatuses, sites, tunnelEnabled]);
  const openSites = openIds.map((id) => siteMap.get(id)).filter(Boolean) as SiteConnectionContext[];
  const openInitialSite = useStableEvent((siteId: string) => {
    if (!openIds.includes(siteId) && openIds.length >= MAX_CONCURRENT_PREVIEWS) {
      void dialog.alert({
        title: '미리보기 개수 제한',
        message: `동시에 최대 ${MAX_CONCURRENT_PREVIEWS}개까지 재생할 수 있습니다. 기존 미리보기를 닫고 다시 선택하세요.`,
      });
      return;
    }
    setOpenIds((current) => (current.includes(siteId) ? current : [siteId, ...current]));
    setFocusedSiteId(siteId);
  });

  // 화면 전환으로 전달된 현장 ID가 바뀔 때만 자동으로 연다.
  useEffect(() => {
    if (!initialSiteId) return;
    openInitialSite(initialSiteId);
  }, [initialSiteId, openInitialSite]);

  useEffect(() => {
    if (!focusedSiteId) return undefined;

    // 전체화면 타일은 스크롤 컨테이너 기준 absolute라, 스크롤이 내려간 상태면 화면 밖에
    // 배치돼 깨져 보인다. 전체화면 진입 시 스크롤을 맨 위로 되돌려 항상 보이는 영역을 채우게 한다.
    if (gridWrapRef.current) gridWrapRef.current.scrollTop = 0;

    function closeFocusOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setFocusedSiteId(null);
    }

    document.addEventListener('keydown', closeFocusOnEscape);
    return () => document.removeEventListener('keydown', closeFocusOnEscape);
  }, [focusedSiteId]);

  function toggleSite(siteId: string) {
    if (!openIds.includes(siteId) && openIds.length >= MAX_CONCURRENT_PREVIEWS) {
      void dialog.alert({
        title: '미리보기 개수 제한',
        message: `동시에 최대 ${MAX_CONCURRENT_PREVIEWS}개까지 재생할 수 있습니다. 기존 미리보기를 닫고 다시 선택하세요.`,
      });
      return;
    }
    setOpenIds((current) => (
      current.includes(siteId) ? current.filter((id) => id !== siteId) : [...current, siteId]
    ));
    if (focusedSiteId === siteId) setFocusedSiteId(null);
  }

  return (
    <section className="monitoring-view">
      <aside className="monitoring-picker">
        <div className="monitoring-search">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tunnelEnabled ? '학원, 강의실 검색' : '학원, 강의실, IP 검색'} />
        </div>

        <div className="monitoring-sites">
          {Object.entries(groupedSites).map(([academyName, academySites]) => (
            <div key={academyName} className="monitoring-group">
              <strong>{academyName}</strong>
              {academySites.map((site) => {
                const open = openIds.includes(site.id);
                const status = statuses[site.id];
                const tone = siteTone(status, agentStatuses[site.id], tunnelEnabled);
                const recording = status?.isRecording && tone !== 'offline';
                const monitorTone = recording ? 'recording' : tone;

                return (
                  <button type="button" key={site.id} className={open ? 'active' : ''} onClick={() => toggleSite(site.id)}>
                    <span className={monitorTone} />
                    <div>
                      <em>{getSiteName(site)}</em>
                      {!tunnelEnabled && <small>{site.ip}</small>}
                    </div>
                    {recording && <b>REC</b>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <footer>
          <span>{openSites.length}개 열림</span>
          <div>
            {[1, 2, 3, 4].map((count) => (
              <button type="button" key={count} className={cols === count ? 'active' : ''} onClick={() => setCols(count)}>
                {count}
              </button>
            ))}
          </div>
        </footer>
      </aside>

      <div className={`stream-grid-wrap ${focusedSiteId ? 'has-featured' : ''}`} ref={gridWrapRef}>
        {openSites.length === 0 ? (
          <div className="monitoring-empty">선택한 현장이 없습니다.</div>
        ) : (
          <div className={`stream-grid cols-${cols}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {openSites.map((site) => (
              <StreamTile
                key={site.id}
                site={site}
                status={statuses[site.id]}
                onClose={() => (focusedSiteId === site.id ? setFocusedSiteId(null) : toggleSite(site.id))}
                onFocus={() => setFocusedSiteId((current) => (current === site.id ? null : site.id))}
                featured={focusedSiteId === site.id}
              />
            ))}
          </div>
        )}
      </div>

    </section>
  );
}

function QuietHoursView({
  sites,
  onSaved,
}: {
  sites: Site[];
  onSaved: (siteId: string, quietFrom: string, quietTo: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { quietFrom: string; quietTo: string }>>({});
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      sites.forEach((site) => {
        if (!next[site.id]) {
          next[site.id] = {
            quietFrom: site.quietFrom || '01:30',
            quietTo: site.quietTo || '07:00',
          };
        }
      });
      return next;
    });
  }, [sites]);

  const filteredSites = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return sites;

    return sites.filter((site) => [
      site.academyName,
      site.building,
      site.room,
      site.ip,
    ].some((value) => value?.toLowerCase().includes(text)));
  }, [query, sites]);

  function updateDraft(siteId: string, key: 'quietFrom' | 'quietTo', value: string) {
    setDrafts((current) => ({
      ...current,
      [siteId]: {
        quietFrom: current[siteId]?.quietFrom || '01:30',
        quietTo: current[siteId]?.quietTo || '07:00',
        [key]: value,
      },
    }));
  }

  async function saveSite(site: Site) {
    const draft = drafts[site.id];
    if (!draft) return;

    setSavingId(site.id);
    setError('');
    try {
      const res = await axios.put<{ siteId: string; quietFrom: string; quietTo: string }>(
        `${API_URL}/api/sites/${site.id}/quiet-hours`,
        draft,
      );
      onSaved(res.data.siteId, res.data.quietFrom, res.data.quietTo);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingId('');
    }
  }

  return (
    <section className="quiet-view">
      <div className="quiet-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="학원, 강의실, IP 검색" />
        <span>{filteredSites.length}개 현장</span>
      </div>

      {error && <div className="error-box">저장 실패: {error}</div>}

      <div className="quiet-list">
        {filteredSites.map((site) => {
          const draft = drafts[site.id] || { quietFrom: site.quietFrom || '01:30', quietTo: site.quietTo || '07:00' };
          const changed = draft.quietFrom !== (site.quietFrom || '01:30') || draft.quietTo !== (site.quietTo || '07:00');

          return (
            <article key={site.id} className="quiet-row">
              <div>
                <strong>{getSiteName(site)}</strong>
                <span>{site.academyName} · {site.ip}</span>
              </div>
              <label>
                <span>시작</span>
                <input type="time" value={draft.quietFrom} onChange={(event) => updateDraft(site.id, 'quietFrom', event.target.value)} />
              </label>
              <label>
                <span>종료</span>
                <input type="time" value={draft.quietTo} onChange={(event) => updateDraft(site.id, 'quietTo', event.target.value)} />
              </label>
              <button type="button" onClick={() => saveSite(site)} disabled={!changed || savingId === site.id}>
                {savingId === site.id ? '저장 중' : '저장'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LoginScreen({ onLoggedIn, notice = '' }: { onLoggedIn: (token: string, user: AuthUser) => Promise<void>; notice?: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  function loginErrorMessage(code: string) {
    if (code === 'invalid_credentials') return '아이디 또는 비밀번호가 올바르지 않습니다.';
    if (code === 'pending_approval') return '관리자 승인 대기 중인 계정입니다.';
    if (code === 'rejected') return '가입이 거절된 계정입니다.';
    return '로그인에 실패했습니다.';
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'login') {
        const res = await axios.post(`${API_URL}/api/auth/login`, { username, password });
        await onLoggedIn(res.data.token, res.data.user);
      } else {
        await axios.post(`${API_URL}/api/auth/register`, { username, password, name });
        setInfo('가입 요청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.');
        setMode('login');
        setPassword('');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.error;
        if (mode === 'login') setError(loginErrorMessage(String(code)));
        else if (code === 'username_taken') setError('이미 사용 중인 아이디입니다.');
        else setError(err.response?.data?.message || '요청에 실패했습니다.');
      } else {
        setError('서버에 연결할 수 없습니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <h1>Fieldlink</h1>
          <p>모니터링 업무앱</p>
        </div>

        <div className="login-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>로그인</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>회원가입</button>
        </div>

        <label className="login-field">
          <span>아이디</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required autoComplete="username" />
        </label>
        {mode === 'register' && (
          <label className="login-field">
            <span>이름</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label className="login-field">
          <span>비밀번호</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>

        {notice && <p className="login-error" role="status">{notice}</p>}
        {error && <p className="login-error">{error}</p>}
        {info && <p className="login-info">{info}</p>}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입 요청'}
        </button>
        {mode === 'register' && <p className="login-note">가입 후 관리자 승인이 있어야 로그인할 수 있습니다.</p>}
      </form>
    </div>
  );
}

type UserNote = { id: string; content: string; done: boolean; createdAt: string; updatedAt: string };

function NotesView() {
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get<UserNote[]>(`${API_URL}/api/notes`);
      setNotes(res.data);
    } catch {
      setError('노트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    try {
      const res = await axios.post<UserNote>(`${API_URL}/api/notes`, { content });
      setNotes((current) => [res.data, ...current]);
      setDraft('');
    } catch {
      setError('노트 저장에 실패했습니다.');
    }
  }

  async function toggleDone(note: UserNote) {
    try {
      const res = await axios.put<UserNote>(`${API_URL}/api/notes/${note.id}`, { done: !note.done });
      setNotes((current) => current.map((n) => (n.id === note.id ? res.data : n)));
    } catch {
      setError('변경에 실패했습니다.');
    }
  }

  async function removeNote(note: UserNote) {
    try {
      await axios.delete(`${API_URL}/api/notes/${note.id}`);
      setNotes((current) => current.filter((n) => n.id !== note.id));
    } catch {
      setError('삭제에 실패했습니다.');
    }
  }

  return (
    <section className="page-panel">
      <form className="note-compose" onSubmit={addNote}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="예: 내일 오전 검단 806호 NVR 확인" />
        <button type="submit" className="primary">추가</button>
      </form>
      {error && <p className="page-error">{error}</p>}
      {loading ? (
        <p className="page-empty">불러오는 중…</p>
      ) : notes.length === 0 ? (
        <p className="page-empty">아직 작성한 노트가 없습니다.</p>
      ) : (
        <ul className="note-list">
          {notes.map((note) => (
            <li key={note.id} className={note.done ? 'done' : ''}>
              <label>
                <input type="checkbox" checked={note.done} onChange={() => toggleDone(note)} />
                <span className="note-content">{note.content}</span>
              </label>
              <div className="note-meta">
                <time>{formatTime(note.createdAt)}</time>
                <button type="button" onClick={() => removeNote(note)} aria-label="삭제">삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyPageView({ currentUser, onUserUpdated }: { currentUser: AuthUser; onUserUpdated: (user: AuthUser) => void }) {
  const [name, setName] = useState(currentUser.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const payload: { name?: string; currentPassword?: string; newPassword?: string } = {};
      if (name.trim() && name.trim() !== currentUser.name) payload.name = name.trim();
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      if (!payload.name && !payload.newPassword) {
        setError('변경할 내용이 없습니다.');
        setBusy(false);
        return;
      }
      const res = await axios.put<AuthUser>(`${API_URL}/api/auth/me`, payload);
      onUserUpdated(res.data);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('저장되었습니다.');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error === 'invalid_current_password') {
        setError('현재 비밀번호가 올바르지 않습니다.');
      } else {
        setError('저장에 실패했습니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-panel">
      <form className="settings-form" onSubmit={save}>
        <div className="settings-group">
          <h3>계정</h3>
          <label><span>아이디</span><input value={currentUser.username} disabled /></label>
          <label><span>이름</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        </div>
        <div className="settings-group">
          <h3>비밀번호 변경</h3>
          <label><span>현재 비밀번호</span><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></label>
          <label><span>새 비밀번호</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="6자 이상" /></label>
          <p className="settings-note">비밀번호를 바꾸지 않으려면 비워두세요.</p>
        </div>
        {error && <p className="page-error">{error}</p>}
        {message && <p className="page-info">{message}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </form>
    </section>
  );
}

function AdminView({ currentUserId }: { currentUserId: string }) {
  const dialog = useAppDialog();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get<AuthUser[]>(`${API_URL}/api/admin/users`);
      setUsers(res.data);
    } catch {
      setError('회원 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, action: 'approve' | 'reject') {
    if (action === 'reject') {
      const confirmed = await dialog.confirm({
        title: '가입 요청 거절',
        message: '이 가입 요청을 삭제합니다. 같은 아이디로 다시 가입할 수 있습니다.',
        confirmText: '거절',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    try {
      await axios.put(`${API_URL}/api/admin/users/${id}/${action}`);
      await load();
    } catch {
      await dialog.alert('처리에 실패했습니다.');
    }
  }

  async function resetPassword(user: AuthUser) {
    const next = window.prompt(`${user.name}(@${user.username})의 새 비밀번호를 입력하세요 (6자 이상).`);
    if (next === null) return;
    if (next.length < 6) { await dialog.alert('비밀번호는 6자 이상이어야 합니다.'); return; }
    try {
      await axios.post(`${API_URL}/api/admin/users/${user.id}/reset-password`, { newPassword: next });
      await dialog.alert('비밀번호를 초기화했습니다.');
    } catch {
      await dialog.alert('초기화에 실패했습니다.');
    }
  }

  async function removeUser(user: AuthUser) {
    const confirmed = await dialog.confirm({
      title: '계정 삭제',
      message: `${user.name}(@${user.username}) 계정과 작성한 노트를 모두 삭제합니다. 되돌릴 수 없습니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await axios.delete(`${API_URL}/api/admin/users/${user.id}`);
      setUsers((current) => current.filter((item) => item.id !== user.id));
    } catch (deleteError) {
      const code = axios.isAxiosError(deleteError) ? deleteError.response?.data?.error : '';
      await dialog.alert(code === 'cannot_delete_self' ? '현재 로그인한 관리자 계정은 삭제할 수 없습니다.' : '계정 삭제에 실패했습니다.');
    }
  }

  const pending = users.filter((u) => u.status === 'pending');
  const members = users.filter((u) => u.status === 'approved');

  return (
    <section className="page-panel">
      {error && <p className="page-error">{error}</p>}
      {loading ? (
        <p className="page-empty">불러오는 중…</p>
      ) : (
        <>
          <div className="admin-section">
            <h3>가입 요청 {pending.length > 0 && <em>{pending.length}</em>}</h3>
            {pending.length === 0 ? (
              <p className="page-empty">대기 중인 가입 요청이 없습니다.</p>
            ) : (
              <ul className="admin-user-list">
                {pending.map((u) => (
                  <li key={u.id}>
                    <div className="admin-user-info"><strong>{u.name}</strong><span>@{u.username}</span></div>
                    <div className="admin-user-actions">
                      <button type="button" className="primary" onClick={() => setStatus(u.id, 'approve')}>승인</button>
                      <button type="button" className="danger" onClick={() => setStatus(u.id, 'reject')}>거절</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-section">
            <h3>회원</h3>
            <ul className="admin-user-list">
              {members.map((u) => (
                <li key={u.id}>
                  <div className="admin-user-info">
                    <strong>{u.name}{u.role === 'admin' ? ' · 관리자' : ''}</strong>
                    <span>@{u.username} · 승인됨</span>
                  </div>
                  <div className="admin-user-actions">
                    <button type="button" onClick={() => resetPassword(u)}>비번 초기화</button>
                    {u.id !== currentUserId && <button type="button" className="danger" onClick={() => removeUser(u)}>계정 삭제</button>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function AccountDialog({
  currentUser,
  activeTab,
  onTabChange,
  onClose,
  onUserUpdated,
}: {
  currentUser: AuthUser;
  activeTab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  onClose: () => void;
  onUserUpdated: (user: AuthUser) => void;
}) {
  const backdrop = useModalBackdrop(onClose);

  return (
    <div className="modal-backdrop account-dialog-backdrop" {...backdrop}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" onClick={(event) => event.stopPropagation()}>
        <header className="account-dialog-header">
          <div>
            <h3 id="account-dialog-title">계정 관리</h3>
            <p>{currentUser.name} · @{currentUser.username}</p>
          </div>
          <button type="button" className="memo-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="account-dialog-tabs" role="tablist" aria-label="계정 관리 메뉴">
          <button type="button" role="tab" aria-selected={activeTab === 'mypage'} className={activeTab === 'mypage' ? 'active' : ''} onClick={() => onTabChange('mypage')}>마이페이지</button>
          <button type="button" role="tab" aria-selected={activeTab === 'notes'} className={activeTab === 'notes' ? 'active' : ''} onClick={() => onTabChange('notes')}>내 노트</button>
          {currentUser.role === 'admin' && (
            <><button type="button" role="tab" aria-selected={activeTab === 'admin'} className={activeTab === 'admin' ? 'active' : ''} onClick={() => onTabChange('admin')}>회원 관리</button>
            {APP_EDITION === 'tunnel-preview' && <button type="button" role="tab" aria-selected={activeTab === 'agent-updates'} className={activeTab === 'agent-updates' ? 'active' : ''} onClick={() => onTabChange('agent-updates')}>에이전트 업데이트</button>}</>
          )}
        </div>
        <div className="account-dialog-body" role="tabpanel">
          {activeTab === 'agent-updates' && currentUser.role === 'admin' && APP_EDITION === 'tunnel-preview' && <AgentUpdates apiUrl={API_URL} />}
          {activeTab === 'mypage' && <MyPageView currentUser={currentUser} onUserUpdated={onUserUpdated} />}
          {activeTab === 'notes' && <NotesView />}
          {activeTab === 'admin' && currentUser.role === 'admin' && <AdminView currentUserId={currentUser.id} />}
        </div>
      </section>
    </div>
  );
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="desktop-frame auth-frame">
      <TitleBar compact />
      {children}
    </div>
  );
}

// 인증 게이트: 토큰이 없으면 로그인 화면을, 있으면 앱을 렌더링한다.
function AuthGate() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loginNotice, setLoginNotice] = useState('');

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setChecking(false);
      return;
    }
    applyAuthToken(token);
    // 저장된 토큰이 아직 유효한지 서버에 확인. 만료/무효면 로그인 화면으로.
    axios.get(`${API_URL}/api/auth/me`)
      .then(async (res) => {
        await window.kioskDesktop?.setAuthToken(token);
        setUser(res.data);
      })
      .catch((error) => {
        applyAuthToken(null);
        window.kioskDesktop?.setAuthToken(null).catch(() => undefined);
        if (axios.isAxiosError(error) && error.response?.status === 401)
          setLoginNotice('로그인이 만료되었거나 계정 정보가 변경되었습니다. 다시 로그인해주세요.');
      })
      .finally(() => setChecking(false));
  }, []);

  async function handleLoggedIn(token: string, loggedInUser: AuthUser) {
    applyAuthToken(token);
    await window.kioskDesktop?.setAuthToken(token);
    setUser(loggedInUser);
    setLoginNotice('');
  }

  const handleLogout = useCallback(() => {
    applyAuthToken(null);
    window.kioskDesktop?.setAuthToken(null).catch(() => undefined);
    setUser(null);
  }, []);

  const handleSessionExpired = useCallback(() => {
    setLoginNotice('로그인이 만료되었거나 계정 정보가 변경되었습니다. 다시 로그인해주세요.');
    handleLogout();
  }, [handleLogout]);

  useEffect(() => {
    if (checking) return;
    window.kioskDesktop?.setWindowAuthenticated(Boolean(user)).catch(() => undefined);
  }, [checking, user]);

  // 토큰 만료 등으로 401이 오면 자동 로그아웃해 로그인 화면으로 돌린다.
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401 && getStoredToken()) {
          handleSessionExpired();
        }
        return Promise.reject(err);
      },
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [handleSessionExpired]);

  if (checking) return <AuthFrame><div className="login-screen"><div className="login-loading">불러오는 중…</div></div></AuthFrame>;
  if (!user) return <AuthFrame><LoginScreen onLoggedIn={handleLoggedIn} notice={loginNotice} /></AuthFrame>;
  return <App currentUser={user} onLogout={handleLogout} onSessionExpired={handleSessionExpired}
    onUserUpdated={(next: AuthUser & { reauthenticate?: boolean }) => {
      if (next.reauthenticate) handleSessionExpired();
      else setUser(next);
    }} />;
}

function App({ currentUser, onLogout, onUserUpdated, onSessionExpired }: {
  currentUser: AuthUser;
  onLogout: () => void;
  onUserUpdated: (user: AuthUser) => void;
  onSessionExpired: () => void;
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [recordingFolder, setRecordingFolder] = useState<{ siteId: string; path: string } | null>(null);
  const { observe: observeAgents, disconnect: disconnectAgents } = useAgentStatuses(APP_EDITION === 'tunnel-preview', setSnapshot);
  const snapshotRevision = useRef(0);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [cameraTypeFilter, setCameraTypeFilter] = useState<CameraTypeFilter>('all');
  const [view, setView] = useState<View>('sites');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [monitoringSiteId, setMonitoringSiteId] = useState<string | undefined>();
  const [downloads, setDownloads] = useState<Record<string, DownloadJob>>(() => readDownloadHistory());
  const [downloadDir, setDownloadDir] = useState(() => window.localStorage.getItem(DOWNLOAD_DIR_KEY) || '');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [videoRecoveryOpen, setVideoRecoveryOpen] = useState(false);
  const [siteAddOpen, setSiteAddOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountDialogTab, setAccountDialogTab] = useState<AccountTab | null>(null);
  const [appInfo, setAppInfo] = useState<AppUpdateInfo | null>(null);
  const [tunnelClientStatus, setTunnelClientStatus] = useState<'not_installed' | 'needs_login' | 'offline' | 'online' | 'error' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [dialogRequest, setDialogRequest] = useState<AppDialogRequest | null>(null);
  const [serviceTasksVersion, setServiceTasksVersion] = useState(0);
  const browserDownloadControllers = useRef<Record<string, AbortController>>({});
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const appDialog = useMemo<AppDialogApi>(() => ({
    alert: (options) => new Promise<void>((resolve) => {
      setDialogRequest({
        ...normalizeDialogOptions(options),
        mode: 'alert',
        resolve: () => resolve(),
      });
    }),
    confirm: (options) => new Promise<boolean>((resolve) => {
      setDialogRequest({
        ...normalizeDialogOptions(options),
        mode: 'confirm',
        resolve,
      });
    }),
  }), []);

  function resolveDialog(value: boolean) {
    setDialogRequest((current) => {
      current?.resolve(value);
      return null;
    });
  }

  const loadDashboard = useCallback(async () => {
    const revision = ++snapshotRevision.current;
    setError('');
    setRefreshing(true);
    try {
      const res = await axios.get<DashboardSnapshot>(`${API_URL}/api/dashboard`, { timeout: 10_000 });
      if (snapshotRevision.current === revision) {
        const agents = observeAgents(res.data.agentStatuses || {}, true);
        setSnapshot(applyAgentStatuses(res.data, agents));
      }
    } catch (loadError) {
      if (snapshotRevision.current === revision) {
        disconnectAgents();
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      setRefreshing(false);
    }
  }, [observeAgents, disconnectAgents]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const desktop = window.kioskDesktop;
    if (!desktop) return undefined;

    let active = true;
    desktop.getAppInfo()
      .then((info) => {
        if (active) setAppInfo(info);
      })
      .catch(() => {
        if (active) setAppInfo(null);
      });
    const unsubscribe = desktop.onAppUpdateStatus((info) => {
      if (active) setAppInfo(info);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (APP_EDITION !== 'tunnel-preview' || !window.kioskDesktop?.getTunnelClientStatus) return undefined;
    let active = true;
    async function checkTunnelClient() {
      try {
        const status = await window.kioskDesktop!.getTunnelClientStatus();
        if (active) setTunnelClientStatus(status === 'disabled' ? 'error' : status);
      } catch { if (active) setTunnelClientStatus('error'); }
    }
    void checkTunnelClient();
    const timer = window.setInterval(() => { void checkTunnelClient(); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    const socket = io(API_URL, { auth: { token: getStoredToken(), edition: APP_EDITION } });
    const stopSessionListener = listenForSessionRevocation(socket, onSessionExpired);
    socket.on('disconnect', () => {
      if (APP_EDITION !== 'tunnel-preview') return;
      snapshotRevision.current += 1;
      disconnectAgents();
      setError('중앙 서버와 실시간 연결이 끊겼습니다. 재연결을 기다리고 있습니다.');
    });
    socket.on('connect_error', () => {
      if (APP_EDITION !== 'tunnel-preview') return;
      snapshotRevision.current += 1;
      disconnectAgents();
      setError('중앙 서버에 연결하지 못했습니다. 서버와 인터넷 연결을 확인하세요.');
    });
    socket.on('dashboard:snapshot', (next: DashboardSnapshot) => {
      snapshotRevision.current += 1;
      const agents = observeAgents(next.agentStatuses || {}, true);
      setSnapshot(applyAgentStatuses(next, agents));
      setError('');
    });
    socket.on('site:status', (status: SiteStatus) => {
      setSnapshot((current) => {
        if (!current) return current;
        return {
          ...current,
          statuses: { ...current.statuses, [status.siteId]: status },
        };
      });
    });
    socket.on('agent:status', (status: SiteAgentStatus) => {
      const agents = observeAgents({ [status.siteId]: status }, false);
      setSnapshot((current) => {
        if (!current) return current;
        return applyAgentStatuses(current, APP_EDITION === 'tunnel-preview'
          ? agents : { ...(current.agentStatuses || {}), ...agents });
      });
    });
    socket.on('settings:updated', (payload: { checkIntervalMs: number; checkEnabled: boolean }) => {
      setSnapshot((current) => (current
        ? { ...current, checkIntervalMs: payload.checkIntervalMs, checkEnabled: payload.checkEnabled }
        : current));
    });
    socket.on('service-tasks:updated', () => setServiceTasksVersion((current) => current + 1));
    return () => {
      stopSessionListener();
      snapshotRevision.current += 1;
      socket.disconnect();
    };
  }, [observeAgents, disconnectAgents, onSessionExpired]);

  useEffect(() => {
    if (!window.kioskDesktop?.onDownloadProgress) return undefined;

    return window.kioskDesktop.onDownloadProgress((progress) => {
      const now = Date.now();
      setDownloads((current) => {
        const job = current[progress.id];
        if (!job) return current;
        const nextJob = updateDownloadJob(job, progress, now);
        return nextJob ? { ...current, [progress.id]: nextJob } : current;
      });
    });
  }, []);

  useEffect(() => {
    if (!window.kioskDesktop?.onPcTransferProgress) return undefined;
    return window.kioskDesktop.onPcTransferProgress((progress) => {
      if (progress.direction !== 'download') return;
      setDownloads((current) => {
        const job = current[progress.id];
        if (!job) return current;
        const nextJob = updateDownloadJob(job, {
          id: progress.id, direction: 'download', status: 'downloading',
          percent: progress.total ? Math.min(100, Math.round(progress.bytes / progress.total * 100)) : null,
          receivedBytes: progress.bytes, totalBytes: progress.total,
        });
        return nextJob ? { ...current, [progress.id]: nextJob } : current;
      });
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const nextDownloads = getRecentDownloadHistory(downloads, now);

      window.localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(nextDownloads));
    }, DOWNLOAD_HISTORY_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [downloads]);

  useEffect(() => {
    if (downloadDir) {
      window.localStorage.setItem(DOWNLOAD_DIR_KEY, downloadDir);
    } else {
      window.localStorage.removeItem(DOWNLOAD_DIR_KEY);
    }
  }, [downloadDir]);

  const summary = useMemo(() => {
    const sites = snapshot?.sites ?? [];
    const statuses = snapshot?.statuses ?? {};
    return sites.reduce(
      (acc, site) => {
        const status = statuses[site.id];
        const tone = siteTone(status, snapshot?.agentStatuses?.[site.id], appInfo?.flavor === 'tunnel-preview');
        acc.total += 1;
        acc[tone] += 1;
        if (status?.isRecording) acc.recording += 1;
        return acc;
      },
      { total: 0, online: 0, partial: 0, offline: 0, unknown: 0, recording: 0 },
    );
  }, [snapshot, appInfo?.flavor]);

  const cameraTypeOptions = useMemo(() => {
    const sites = snapshot?.sites ?? [];
    const counts = sites.reduce<Record<string, number>>((acc, site) => {
      const key = normalizeCameraType(site.cameraType);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .sort(([leftKey, leftCount], [rightKey, rightCount]) => (
        rightCount - leftCount || getCameraTypeLabel(leftKey).localeCompare(getCameraTypeLabel(rightKey), 'ko')
      ))
      .map(([key, count]) => ({
        key,
        label: getCameraTypeLabel(key),
        count,
      }));
  }, [snapshot]);

  const filteredSites = useMemo(() => {
    const sites = snapshot?.sites ?? [];
    const statuses = snapshot?.statuses ?? {};
    const text = query.trim().toLowerCase();

    return sites.filter((site) => {
      const status = statuses[site.id];
      const tone = siteTone(status, snapshot?.agentStatuses?.[site.id], appInfo?.flavor === 'tunnel-preview');
      if (cameraTypeFilter !== 'all' && normalizeCameraType(site.cameraType) !== cameraTypeFilter) return false;
      if (filter === 'recording' && !status?.isRecording) return false;
      if (filter === 'recording') return !text || [
        site.academyName,
        site.building,
        site.room,
        ...(appInfo?.flavor === 'tunnel-preview' ? [] : [site.ip]),
        site.cameraType,
      ].some((value) => value?.toLowerCase().includes(text));
      if (filter !== 'all' && filter !== tone) return false;
      if (!text) return true;

      return [
        site.academyName,
        site.building,
        site.room,
        ...(appInfo?.flavor === 'tunnel-preview' ? [] : [site.ip]),
        site.cameraType,
      ].some((value) => value?.toLowerCase().includes(text));
    });
  }, [appInfo?.flavor, cameraTypeFilter, filter, query, snapshot]);

  useEffect(() => {
    if (!selectedSiteId) return;
    if (!snapshot?.sites.some((site) => site.id === selectedSiteId)) {
      setSelectedSiteId(null);
    }
  }, [selectedSiteId, snapshot]);

  useEffect(() => {
    if (selectedSiteId && !filteredSites.some((site) => site.id === selectedSiteId)) {
      setSelectedSiteId(null);
    }
  }, [filteredSites, selectedSiteId]);

  async function checkSite(siteId: string) {
    const res = await axios.post<SiteStatus>(`${API_URL}/api/sites/${siteId}/check`);
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        statuses: { ...current.statuses, [siteId]: res.data },
      };
    });
  }

  async function checkAllSites() {
    setError('');
    setCheckingAll(true);
    try {
      if (appInfo?.flavor === 'tunnel-preview') {
        const { data } = await axios.post<{ requested: number; completed: number; timedOut: number }>(`${API_URL}/api/sites/refresh-agent-statuses`);
        if (data.timedOut > 0) setError(`${data.requested}개 현장 중 ${data.completed}개 재측정 완료, ${data.timedOut}개 응답 지연`);
        return;
      }
      await axios.post(`${API_URL}/api/sites/check-all`);
      await loadDashboard();
    } catch (checkError) {
      if (axios.isAxiosError(checkError) && checkError.response?.status === 409) {
        setError('이미 다른 전체 검사가 진행 중입니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError(checkError instanceof Error ? checkError.message : String(checkError));
      }
    } finally {
      setCheckingAll(false);
    }
  }

  // 자동 검사 주기/켜짐여부 변경. 서버가 스케줄러를 재설정하고 settings:updated 로 전체 화면에 동기화한다.
  async function updateCheckSettings(next: { intervalMs?: number; enabled?: boolean }) {
    setError('');
    const intervalMs = next.intervalMs ?? snapshot?.checkIntervalMs ?? CHECK_INTERVAL_OPTIONS[0];
    const enabled = next.enabled ?? snapshot?.checkEnabled ?? true;
    try {
      await axios.put(`${API_URL}/api/settings/check-interval`, { intervalMs, enabled });
      setSnapshot((current) => (current ? { ...current, checkIntervalMs: intervalMs, checkEnabled: enabled } : current));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    }
  }

  function startPcDownload(site: Site, job: { id: string; filename: string; requestedPath: string; totalBytes: number | null }) {
    const now = Date.now();
    setDownloads(current => ({ ...current, [job.id]: {
      ...job, source: 'pc', direction: 'download', siteName: getSiteName(site),
      status: 'selecting', percent: null, receivedBytes: 0,
      createdAt: now, updatedAt: now,
    } }));
    setDownloadOpen(true);
  }

  function finishPcDownload(id: string, result: { status: 'completed' | 'canceled' | 'failed'; filePath?: string; error?: string }) {
    setDownloads(current => {
      const job = current[id];
      if (!job) return current;
      return { ...current, [id]: { ...job, ...result,
        percent: result.status === 'completed' ? 100 : null,
        updatedAt: Date.now(),
      } };
    });
  }

  async function startDownloadFile(site: Site, item: SiteFileItem, currentPath: string) {
    const requestedPath = joinFilePath(currentPath, item.name);
    const id = `${site.id}:${requestedPath}:${Date.now()}`;
    const url = `${API_URL}/api/sites/${site.id}/download?path=${encodeURIComponent(requestedPath)}&t=${Date.now()}`;
    const totalBytes = Number.isFinite(item.size) && item.size > 0 ? item.size : null;
    const now = Date.now();
    setDownloadOpen(true);

    setDownloads((current) => ({
      ...current,
      [id]: {
        id,
        direction: 'download',
        filename: item.name,
        siteName: getSiteName(site),
        requestedPath,
        status: 'selecting',
        percent: null,
        receivedBytes: 0,
        totalBytes,
        createdAt: now,
        updatedAt: now,
      },
    }));

    try {
      if (window.kioskDesktop?.downloadFile) {
        const result = await window.kioskDesktop.downloadFile({
          id,
          filename: item.name,
          site,
          requestedPath,
          // 목록에서 이미 알고 있는 크기를 넘겨 FTP size() 왕복을 생략한다.
          size: totalBytes ?? undefined,
        });

        setDownloads((current) => {
          const job = current[id];
          if (!job) return current;

          return {
            ...current,
            [id]: {
              ...job,
              status: result.canceled ? 'canceled' : 'downloading',
              percent: result.canceled ? null : (job.percent ?? 0),
              receivedBytes: job.receivedBytes,
              filePath: result.filePath || job.filePath,
              updatedAt: Date.now(),
            },
          };
        });
        return;
      }

      const controller = new AbortController();
      browserDownloadControllers.current[id] = controller;
      setDownloads((current) => {
        const job = current[id];
        if (!job) return current;

        return {
          ...current,
          [id]: {
            ...job,
            status: 'downloading',
            percent: totalBytes ? 0 : null,
            updatedAt: Date.now(),
          },
        };
      });

      const res = await axios.get<Blob>(url, {
        responseType: 'blob',
        signal: controller.signal,
        onDownloadProgress: (progress) => {
          const nextTotal = progress.total || totalBytes;
          const percent = nextTotal ? Math.min(100, Math.round((progress.loaded / nextTotal) * 100)) : null;
          setDownloads((current) => {
            const job = current[id];
            if (!job) return current;

            return {
              ...current,
              [id]: {
                ...job,
                status: 'downloading',
                percent,
                receivedBytes: progress.loaded,
                totalBytes: nextTotal,
                updatedAt: Date.now(),
              },
            };
          });
        },
      });

      const blobUrl = URL.createObjectURL(res.data);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = item.name;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      }, 100);

      setDownloads((current) => {
        const job = current[id];
        if (!job) return current;

        return {
          ...current,
          [id]: {
            ...job,
            status: 'completed',
            percent: 100,
            receivedBytes: totalBytes ?? res.data.size,
            totalBytes: totalBytes ?? res.data.size,
            updatedAt: Date.now(),
          },
        };
      });
    } catch (downloadError) {
      const isCanceled = axios.isCancel(downloadError) || (downloadError instanceof DOMException && downloadError.name === 'AbortError');
      setDownloads((current) => {
        const job = current[id];
        if (!job) return current;

        return {
          ...current,
          [id]: {
            ...job,
            status: isCanceled ? 'canceled' : 'failed',
            percent: null,
            error: isCanceled
              ? undefined
              : downloadError instanceof Error
                ? downloadError.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
                : String(downloadError),
            updatedAt: Date.now(),
          },
        };
      });
    } finally {
      delete browserDownloadControllers.current[id];
    }
  }

  async function startUploadFiles(site: Site, currentPath: string) {
    setDownloadOpen(true);

    if (!window.kioskDesktop?.selectUploadFiles || !window.kioskDesktop?.uploadFile) {
      setDownloads((current) => {
        const id = `${site.id}:upload:${Date.now()}`;
        const now = Date.now();
        return {
          ...current,
          [id]: {
            id,
            direction: 'upload',
            filename: '업로드',
            siteName: getSiteName(site),
            requestedPath: currentPath,
            status: 'failed',
            percent: null,
            receivedBytes: 0,
            totalBytes: null,
            error: '데스크톱 앱에서만 업로드를 사용할 수 있습니다.',
            createdAt: now,
            updatedAt: now,
          },
        };
      });
      return;
    }

    const selection = await window.kioskDesktop.selectUploadFiles();
    if (selection.canceled || selection.files.length === 0) return;

    await enqueueUploadFiles(site, currentPath, selection.files);
  }

  async function enqueueUploadFiles(site: Site, currentPath: string, files: DesktopUploadFile[]) {
    if (!window.kioskDesktop?.uploadFile || files.length === 0) return;

    const now = Date.now();
    const jobs = files.map((file) => {
      const id = `${site.id}:upload:${file.path}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      return {
        id,
        direction: 'upload' as const,
        filename: file.filename,
        siteName: getSiteName(site),
        requestedPath: joinFilePath(currentPath, file.filename),
        status: 'downloading' as DownloadStatus,
        percent: file.size > 0 ? 0 : null,
        receivedBytes: 0,
        totalBytes: file.size || null,
        createdAt: now,
        updatedAt: now,
        localPath: file.path,
      };
    });

    setDownloads((current) => ({
      ...current,
      ...Object.fromEntries(jobs.map(({ localPath: _localPath, ...job }) => [job.id, job])),
    }));

    await Promise.all(jobs.map(async (job) => {
      try {
        await window.kioskDesktop?.uploadFile({
          id: job.id,
          site,
          localPath: job.localPath,
          remoteDir: currentPath,
        });
      } catch (uploadError) {
        setDownloads((current) => {
          const currentJob = current[job.id];
          if (!currentJob) return current;

          return {
            ...current,
            [job.id]: {
              ...currentJob,
              status: 'failed',
              percent: null,
              error: uploadError instanceof Error
                ? uploadError.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
                : String(uploadError),
              updatedAt: Date.now(),
            },
          };
        });
      }
    }));
  }

  async function startUploadDroppedFiles(site: Site, currentPath: string, files: File[]) {
    setDownloadOpen(true);

    try {
      if (!window.kioskDesktop?.registerDroppedFiles || !window.kioskDesktop?.uploadFile) {
        throw new Error('데스크톱 앱에서만 드래그 업로드를 사용할 수 있습니다.');
      }

      const result = await window.kioskDesktop.registerDroppedFiles(files);
      if (!result.ok || result.files.length === 0) return;
      await enqueueUploadFiles(site, currentPath, result.files);
    } catch (uploadError) {
      const id = `${site.id}:upload-drop:${Date.now()}`;
      const now = Date.now();
      setDownloads((current) => ({
        ...current,
        [id]: {
          id,
          direction: 'upload',
          filename: files.length === 1 ? files[0].name : `${files.length}개 파일`,
          siteName: getSiteName(site),
          requestedPath: currentPath,
          status: 'failed',
          percent: null,
          receivedBytes: 0,
          totalBytes: null,
          error: uploadError instanceof Error
            ? uploadError.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
            : String(uploadError),
          createdAt: now,
          updatedAt: now,
        },
      }));
    }
  }

  async function startDragDownloadFile(site: Site, item: SiteFileItem, currentPath: string) {
    const requestedPath = joinFilePath(currentPath, item.name);
    const id = `${site.id}:drag:${requestedPath}:${Date.now()}`;
    const totalBytes = Number.isFinite(item.size) && item.size > 0 ? item.size : null;
    const now = Date.now();
    setDownloadOpen(true);
    setDownloads((current) => ({
      ...current,
      [id]: {
        id,
        direction: 'download',
        filename: item.name,
        siteName: getSiteName(site),
        requestedPath,
        transferMode: 'drag',
        status: 'selecting',
        percent: totalBytes ? 0 : null,
        receivedBytes: 0,
        totalBytes,
        createdAt: now,
        updatedAt: now,
      },
    }));

    try {
      if (!window.kioskDesktop?.prepareFileDrag) {
        throw new Error('데스크톱 앱에서만 드래그 다운로드를 사용할 수 있습니다.');
      }

      const result = await window.kioskDesktop.prepareFileDrag({
        id,
        filename: item.name,
        site,
        requestedPath,
        size: totalBytes ?? undefined,
        modifiedAt: item.modifiedAt,
      });
      if (!result.ok && !result.canceled) throw new Error(result.error || '드래그 다운로드를 준비하지 못했습니다.');
    } catch (downloadError) {
      setDownloads((current) => {
        const job = current[id];
        if (!job || job.status === 'failed' || job.status === 'canceled') return current;
        return {
          ...current,
          [id]: {
            ...job,
            status: 'failed',
            percent: null,
            error: downloadError instanceof Error
              ? downloadError.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
              : String(downloadError),
            updatedAt: Date.now(),
          },
        };
      });
    }
  }

  async function startVideoRecovery({
    damagedFile,
    sampleFile,
    outputDir,
  }: {
    damagedFile: LocalVideoFile;
    sampleFile: LocalVideoFile;
    outputDir: string;
  }) {
    setDownloadOpen(true);

    const id = `recover:${damagedFile.path}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const now = Date.now();

    setDownloads((current) => ({
      ...current,
      [id]: {
        id,
        direction: 'recover',
        filename: `${damagedFile.filename} 복구`,
        siteName: '영상 복구',
        requestedPath: outputDir,
        status: 'downloading',
        percent: null,
        receivedBytes: 0,
        totalBytes: null,
        createdAt: now,
        updatedAt: now,
      },
    }));

    try {
      if (!window.kioskDesktop?.recoverVideo) {
        throw new Error('데스크톱 앱에서만 영상 복구를 사용할 수 있습니다.');
      }

      await window.kioskDesktop.recoverVideo({
        id,
        samplePath: sampleFile.path,
        damagedPath: damagedFile.path,
        outputDir,
      });
    } catch (recoverError) {
      setDownloads((current) => {
        const job = current[id];
        if (!job) return current;

        return {
          ...current,
          [id]: {
            ...job,
            status: 'failed',
            percent: null,
            error: recoverError instanceof Error
              ? recoverError.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
              : String(recoverError),
            updatedAt: Date.now(),
          },
        };
      });
    }
  }

  async function cancelDownload(id: string) {
    const job = downloads[id];
    if (job?.source === 'pc') {
      await window.kioskDesktop?.cancelPcTransfer?.(id);
      return;
    }
    if (job?.direction === 'recover') {
      if (window.kioskDesktop?.cancelRecovery) {
        await window.kioskDesktop.cancelRecovery(id);
      }
      return;
    }

    if (job?.direction === 'upload') {
      if (window.kioskDesktop?.cancelUpload) {
        await window.kioskDesktop.cancelUpload(id);
      }
      return;
    }

    if (window.kioskDesktop?.cancelDownload) {
      await window.kioskDesktop.cancelDownload(id);
      return;
    }

    browserDownloadControllers.current[id]?.abort();
  }

  async function openTransferLocation(job: DownloadJob) {
    if (!job.filePath || !window.kioskDesktop?.openTransferLocation) {
      await appDialog.alert('완료 파일의 저장 위치를 열 수 없습니다.');
      return;
    }

    try {
      await window.kioskDesktop.openTransferLocation(job.filePath);
    } catch (openError) {
      await appDialog.alert({
        title: '폴더 열기 실패',
        message: openError instanceof Error
          ? openError.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
          : String(openError),
      });
    }
  }

  function dismissDownload(id: string) {
    setDownloads((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function clearFinishedDownloads() {
    setDownloads((current) => Object.fromEntries(
      Object.entries(current).filter(([, job]) => job.status === 'downloading' || job.status === 'selecting'),
    ));
  }

  const downloadJobs = useMemo(
    () => Object.values(downloads).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [downloads],
  );

  function updateQuietHours(siteId: string, quietFrom: string, quietTo: string) {
    setSnapshot((current) => {
      if (!current) return current;

      return {
        ...current,
        sites: current.sites.map((site) => (
          site.id === siteId ? { ...site, quietFrom, quietTo } : site
        )),
      };
    });
  }

  function openSitePreview(siteId: string) {
    setMonitoringSiteId(siteId);
    setView('monitoring');
  }

  function handleSiteSaved(site: Site) {
    setSnapshot((current) => {
      if (!current) return current;
      const exists = current.sites.some((currentSite) => currentSite.id === site.id);
      return {
        ...current,
        sites: exists
          ? current.sites.map((currentSite) => (currentSite.id === site.id ? site : currentSite))
          : [...current.sites, site],
      };
    });
  }

  function handleSiteDeleted(siteId: string) {
    setSelectedSiteId((current) => (current === siteId ? null : current));
    setSnapshot((current) => {
      if (!current) return current;
      const nextStatuses = { ...current.statuses };
      delete nextStatuses[siteId];

      return {
        ...current,
        sites: current.sites.filter((site) => site.id !== siteId),
        statuses: nextStatuses,
      };
    });
  }

  const cardCheckSite = useStableEvent(checkSite);
  const cardDownloadFile = useStableEvent(startDownloadFile);
  const cardUploadFiles = useStableEvent(startUploadFiles);
  const cardUploadDroppedFiles = useStableEvent(startUploadDroppedFiles);
  const cardDragDownload = useStableEvent(startDragDownloadFile);
  const cardPreview = useStableEvent(openSitePreview);
  const cardSelect = useStableEvent((siteId: string) => {
    setSelectedSiteId((current) => (current === siteId ? null : siteId));
  });
  const cardSiteSaved = useStableEvent(handleSiteSaved);
  const cardSiteDeleted = useStableEvent(handleSiteDeleted);

  function openAccountDialog(tab: AccountTab) {
    setAccountDialogTab(tab);
    setAccountMenuOpen(false);
  }

  async function requestLogout() {
    setAccountMenuOpen(false);
    const confirmed = await appDialog.confirm({
      title: '로그아웃',
      message: '정말 로그아웃하시겠습니까?',
      confirmText: '로그아웃',
      tone: 'danger',
    });
    if (confirmed) onLogout();
  }

  async function requestAppUpdate() {
    if (!appInfo || !window.kioskDesktop) return;
    try {
      if (appInfo.status === 'available') {
        await window.kioskDesktop.downloadAppUpdate();
        return;
      }
      if (appInfo.status === 'downloaded') {
        const confirmed = await appDialog.confirm({
          title: '업데이트 설치',
          message: `v${appInfo.availableVersion || '새 버전'}으로 업데이트하기 위해 앱을 재시작합니다. 계속할까요?`,
          confirmText: '재시작 및 업데이트',
        });
        if (confirmed) await window.kioskDesktop.installAppUpdate();
      }
    } catch (updateError) {
      await appDialog.alert({
        title: '업데이트 실패',
        message: updateError instanceof Error ? updateError.message : String(updateError),
      });
    }
  }

  const showAppUpdateAction = appInfo && ['available', 'downloading', 'downloaded'].includes(appInfo.status);
  const appUpdateActionLabel = appInfo?.status === 'downloaded'
    ? '재시작하여 업데이트'
    : appInfo?.status === 'downloading'
      ? `업데이트 다운로드 ${Math.round(appInfo.downloadPercent || 0)}%`
      : `v${appInfo?.availableVersion || '새 버전'} 업데이트 다운로드`;

  return (
    <AppDialogContext.Provider value={appDialog}>
      <div className="desktop-frame">
        <TitleBar />
        {appInfo?.flavor === 'tunnel-preview' && tunnelClientStatus && tunnelClientStatus !== 'online' && (
          <div className="tunnel-client-banner" role="alert">
            {tunnelClientStatus === 'not_installed' ? 'Tailscale이 설치되지 않았습니다. 터널판 설치 파일을 관리자 권한으로 다시 실행해 주세요.'
              : tunnelClientStatus === 'needs_login' ? 'Tailscale 로그인이 필요합니다. 현장 PC와 같은 네트워크에 로그인해 주세요.'
                : tunnelClientStatus === 'offline' ? 'Tailscale 연결이 꺼져 있습니다. 연결 상태를 확인해 주세요.'
                  : 'Tailscale 상태를 확인하지 못했습니다. 앱을 열어 연결을 확인해 주세요.'}
            {tunnelClientStatus !== 'not_installed' && <button type="button" onClick={() => { void window.kioskDesktop?.openTunnelClient(); }}>Tailscale 열기</button>}
          </div>
        )}
        {videoRecoveryOpen && (
          <VideoRecoveryDialog
            downloadDir={downloadDir}
            onDownloadDirChange={setDownloadDir}
            onClose={() => setVideoRecoveryOpen(false)}
            onRecover={startVideoRecovery}
          />
        )}
        {snapshot && siteAddOpen && (
          <SiteFormDialog
            academies={snapshot.academies}
            tunnelEnabled={appInfo?.flavor === 'tunnel-preview'}
            onClose={() => setSiteAddOpen(false)}
            onSaved={(site) => {
              handleSiteSaved(site);
              setSiteAddOpen(false);
            }}
          />
        )}
        {accountDialogTab && (
          <AccountDialog
            currentUser={currentUser}
            activeTab={accountDialogTab}
            onTabChange={setAccountDialogTab}
            onClose={() => setAccountDialogTab(null)}
            onUserUpdated={onUserUpdated}
          />
        )}
        <div className="app-shell">
          <header className="ops-command-bar">
            <div className="brand ops-brand">
              <img className="ops-brand-mark" src={appIconUrl} alt="" aria-hidden="true" />
              <div>
                <h1>Fieldlink OPS</h1>
                {appInfo && (
                  <div className={`brand-version ${appInfo.status}`} title={appInfo.availableVersion ? `새 버전 v${appInfo.availableVersion}` : undefined}>
                    <span>DEMO · 가상 데이터</span>
                    {getUpdateStatusLabel(appInfo) && <span>{getUpdateStatusLabel(appInfo)}</span>}
                  </div>
                )}
              </div>
            </div>

            <nav className="side-nav ops-nav" aria-label="주요 화면">
              <button type="button" className={`nav-item ${view === 'sites' ? 'active' : ''}`} onClick={() => setView('sites')}>현장</button>
              <button type="button" className={`nav-item ${view === 'monitoring' ? 'active' : ''}`} onClick={() => setView('monitoring')}>모니터링</button>
              {APP_EDITION === 'tunnel-preview' && <button type="button" className={`nav-item ${view === 'recordings' ? 'active' : ''}`} onClick={() => setView('recordings')}>녹화·전송</button>}
              {currentUser.role === 'admin' && appInfo?.flavor !== 'tunnel-preview' && <button type="button" className={`nav-item ${view === 'quiet-hours' ? 'active' : ''}`} onClick={() => setView('quiet-hours')}>체크 제외시간</button>}
              <button type="button" className={`nav-item ${view === 'service-tasks' ? 'active' : ''}`} onClick={() => setView('service-tasks')}>AS</button>
            </nav>

            <div className="ops-command-spacer" />

            {appInfo?.flavor !== 'tunnel-preview' && <div className="interval-picker ops-interval-picker">
              <label className="interval-toggle">
                <input
                  type="checkbox"
                  checked={snapshot?.checkEnabled ?? true}
                  onChange={(event) => updateCheckSettings({ enabled: event.target.checked })}
                  disabled={currentUser.role !== 'admin'}
                />
                <span>자동 검사</span>
              </label>
              <select
                className="interval-select"
                value={snapshot?.checkIntervalMs || CHECK_INTERVAL_OPTIONS[0]}
                onChange={(event) => updateCheckSettings({ intervalMs: Number(event.target.value) })}
                disabled={currentUser.role !== 'admin' || !(snapshot?.checkEnabled ?? true)}
              >
                {CHECK_INTERVAL_OPTIONS.map((ms) => (
                  <option key={ms} value={ms}>{INTERVAL_LABELS[ms]}</option>
                ))}
              </select>
            </div>}

            <div className="top-actions">
              <DownloadPanel
                jobs={downloadJobs}
                open={downloadOpen}
                onCancel={cancelDownload}
                onClose={() => setDownloadOpen(false)}
                onDismiss={dismissDownload}
                onOpenLocation={openTransferLocation}
                onToggle={() => setDownloadOpen((value) => !value)}
                onClearFinished={clearFinishedDownloads}
              />
              <button type="button" className="video-recovery-trigger" onClick={() => setVideoRecoveryOpen(true)}>영상 복구</button>
              <button type="button" className="site-add-trigger" onClick={() => setSiteAddOpen(true)}>현장 추가</button>
            </div>

            <div className="account-menu ops-account-menu" ref={accountMenuRef}>
              {accountMenuOpen && (
                <div className="account-menu-popover" role="menu" aria-label="계정 메뉴">
                  <button type="button" role="menuitem" onClick={() => openAccountDialog('mypage')}>마이페이지</button>
                  <button type="button" role="menuitem" onClick={() => openAccountDialog('notes')}>내 노트</button>
                  {currentUser.role === 'admin' && (
                    <button type="button" role="menuitem" onClick={() => openAccountDialog('admin')}>회원 관리</button>
                  )}
                  <div className="account-menu-divider" />
                  <button type="button" role="menuitem" className="account-menu-logout" onClick={() => requestLogout()}>로그아웃</button>
                </div>
              )}
              <div className="account-menu-row">
                <button
                  type="button"
                  className={`account-menu-trigger ${accountMenuOpen ? 'open' : ''}`}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onClick={() => setAccountMenuOpen((open) => !open)}
                >
                  <span className="account-avatar">{currentUser.name.slice(0, 1)}</span>
                  <span className="account-menu-info">
                    <strong>{currentUser.name}</strong>
                    <span>@{currentUser.username}</span>
                  </span>
                  <span className="account-menu-chevron" aria-hidden="true" />
                </button>
                {appInfo && showAppUpdateAction && (
                  <button
                    type="button"
                    className={`account-update-button ${appInfo.status}`}
                    disabled={appInfo.status === 'downloading'}
                    onClick={() => requestAppUpdate()}
                    aria-label={appUpdateActionLabel}
                    title={appUpdateActionLabel}
                  >
                    {appInfo.status === 'downloading' ? `${Math.round(appInfo.downloadPercent || 0)}%` : appInfo.status === 'downloaded' ? '↻' : '↓'}
                  </button>
                )}
              </div>
            </div>
          </header>

        <main className={`content ${view === 'sites' ? 'sites-content' : ''}`}>
          {view === 'recordings' && APP_EDITION === 'tunnel-preview' && <RecordingHistory apiUrl={API_URL} onOpenFolder={(siteId, path) => setRecordingFolder({ siteId, path })} />}
          {recordingFolder && (() => {
            const site = snapshot?.sites.find(item => item.id === recordingFolder.siteId);
            return site && <FilesDialog site={{ ...site, agentStatus: snapshot?.agentStatuses?.[site.id] }} initialPath={recordingFolder.path}
              onClose={() => setRecordingFolder(null)} onDownloadFile={cardDownloadFile} onUploadFiles={cardUploadFiles}
              onUploadDroppedFiles={cardUploadDroppedFiles} onDragDownload={cardDragDownload} />;
          })()}

          {error && <div className="error-box">서버 연결 실패: {error}</div>}
          {!snapshot && !error && <div className="empty-state">현장 정보를 불러오는 중입니다.</div>}

          {snapshot && view === 'sites' && (
            <>
              <section className="ops-filter-strip">
                <div className="summary-grid">
                  <SummaryTile
                    label="전체"
                    value={summary.total}
                    tone="all"
                    active={filter === 'all' && cameraTypeFilter === 'all'}
                    onClick={() => {
                      setFilter('all');
                      setCameraTypeFilter('all');
                    }}
                  />
                  <SummaryTile label="정상" value={summary.online} tone="online" active={filter === 'online'} onClick={() => setFilter('online')} />
                  <SummaryTile label="녹화중" value={summary.recording} tone="recording" active={filter === 'recording'} onClick={() => setFilter('recording')} />
                  <SummaryTile label="주의" value={summary.partial} tone="partial" active={filter === 'partial'} onClick={() => setFilter('partial')} />
                  <SummaryTile label="오프라인" value={summary.offline} tone="offline" active={filter === 'offline'} onClick={() => setFilter('offline')} />
                </div>

                {cameraTypeOptions.length > 0 && (
                  <section className="camera-type-filter" aria-label="카메라 종목 필터">
                    <button type="button" className={cameraTypeFilter === 'all' ? 'active' : ''} onClick={() => setCameraTypeFilter('all')}>
                      <span>전체</span><strong>{summary.total}</strong>
                    </button>
                    {cameraTypeOptions.map((option) => (
                      <button key={option.key} type="button" className={cameraTypeFilter === option.key ? 'active' : ''} onClick={() => setCameraTypeFilter(option.key)}>
                        <span>{option.label}</span><strong>{option.count}</strong>
                      </button>
                    ))}
                  </section>
                )}

                <span className="ops-filter-count">{filteredSites.length}개 현장</span>
              </section>

              <section className="toolbar">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={appInfo?.flavor === 'tunnel-preview' ? '학원, 강의실 검색' : '학원, 강의실, IP 검색'}
                />
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={checkAllSites}
                  disabled={checkingAll || refreshing}
                >
                  {appInfo?.flavor === 'tunnel-preview'
                    ? checkingAll ? '요청 중' : '상태 새로고침'
                    : checkingAll ? '검사 중' : '전체 검사'}
                </button>
                <span className="toolbar-server-time">실시간 상태 동기화</span>
              </section>

              <div className={`sites-workspace ${selectedSiteId ? 'with-inspector' : ''}`}>
                <section className="site-list">
                  {filteredSites.length > 0 && (
                    <SiteListHeader tunnelEnabled={appInfo?.flavor === 'tunnel-preview'} />
                  )}
                  {filteredSites.map((site) => (
                    <ActionSiteCard
                      key={site.id}
                      site={site}
                      status={snapshot.statuses[site.id]}
                      agentStatus={snapshot.agentStatuses?.[site.id]}
                      tunnelEnabled={appInfo?.flavor === 'tunnel-preview'}
                      selected={selectedSiteId === site.id}
                      currentUser={currentUser}
                      academies={snapshot.academies}
                      onCheck={cardCheckSite}
                      onDownloadFile={cardDownloadFile}
                      onUploadFiles={cardUploadFiles}
                      onUploadDroppedFiles={cardUploadDroppedFiles}
                      onDragDownload={cardDragDownload}
                      onPcDownloadStart={startPcDownload}
                      onPcDownloadFinish={finishPcDownload}
                      onPreview={cardPreview}
                      onSelect={cardSelect}
                      onSiteSaved={cardSiteSaved}
                      onSiteDeleted={cardSiteDeleted}
                    />
                  ))}
                  {filteredSites.length === 0 && (
                    <div className="empty-state">조건에 맞는 현장이 없습니다.</div>
                  )}
                </section>
              </div>
            </>
          )}

          {snapshot && view === 'monitoring' && (
            <MonitoringView
              sites={snapshot.sites}
              statuses={snapshot.statuses}
              agentStatuses={snapshot.agentStatuses || {}}
              tunnelEnabled={appInfo?.flavor === 'tunnel-preview'}
              initialSiteId={monitoringSiteId}
            />
          )}

          {snapshot && view === 'quiet-hours' && (
            <QuietHoursView sites={snapshot.sites} onSaved={updateQuietHours} />
          )}

          {snapshot && view === 'service-tasks' && (
            <ServiceTasksView currentUser={currentUser} refreshVersion={serviceTasksVersion} />
          )}

        </main>
        </div>
      </div>
      <AppDialogHost request={dialogRequest} onResolve={resolveDialog} />
    </AppDialogContext.Provider>
  );
}

const rootElement = document.getElementById('root')! as HTMLElement & {
  __kioskRoot?: ReturnType<typeof createRoot>;
};
const root = rootElement.__kioskRoot ?? createRoot(rootElement);
rootElement.__kioskRoot = root;

root.render(
  <React.StrictMode>
    <App currentUser={demoUser} onLogout={() => window.location.reload()} onUserUpdated={() => undefined} onSessionExpired={() => undefined} />
  </React.StrictMode>,
);
