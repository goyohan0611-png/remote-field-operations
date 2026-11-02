/// <reference types="vite/client" />

import type { Site, SiteAgentStatus, SiteConnectionContext, SiteFileList, DeletePreview, DeleteProgress, DeleteResult } from '@fieldlink/shared';

type DesktopDownloadStatus = 'downloading' | 'completed' | 'failed' | 'canceled';
type DesktopTransferDirection = 'download' | 'upload' | 'recover';
type DesktopUpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'error';
type DesktopAppInfo = {
  version: string;
  flavor: 'stable' | 'tunnel-preview';
  displayName: string;
  status: DesktopUpdateStatus;
  availableVersion: string | null;
  downloadPercent: number | null;
};
type DesktopUploadFile = {
  path: string;
  filename: string;
  size: number;
};
type SshEventPayload = {
  id: string;
  data?: string;
  error?: string;
};
type CropChannel = {
  channelId: number;
  cropUse: number;
  cropLeft: number;
  cropTop: number;
  cropWidth: number;
  cropHeight: number;
};
type DiscoveredNvr = {
  ip: string;
  netmask: string;
  gateway: string;
  dns1: string;
  dns2: string;
  dhcp: number;
  mac: string;
};
type NvrAdvancedChannel = {
  channelNo: number;
  name: string;
  audioInput: number;
  videoInput: number;
  audioGainLeft: number;
  audioGainRight: number;
};
type NvrAdvancedConfig = {
  model: string;
  channels: NvrAdvancedChannel[];
};

declare global {
  interface Window {
    kioskDesktop?: {
      setAuthToken: (token: string | null) => Promise<{ ok: boolean }>;
      observeAgentStatuses: (statuses: Record<string, SiteAgentStatus>, replace: boolean) => void;
      disconnectAgentStatuses: () => void;
      openExternalUrl: (url: string) => Promise<{ ok: boolean }>;
      openRdp: (site: Site) => Promise<{ ok: true; address: string }>;
      openSsh: (site: Site) => Promise<{ ok: boolean }>;
      startSshSession: (options: { id: string; site: Site; rows?: number; cols?: number }) => Promise<{ ok: boolean }>;
      sendSshInput: (options: { id: string; data: string }) => Promise<{ ok: boolean }>;
      resizeSshSession: (options: { id: string; rows: number; cols: number }) => Promise<{ ok: boolean }>;
      closeSshSession: (id: string) => Promise<{ ok: boolean }>;
      onSshData: (callback: (payload: SshEventPayload) => void) => () => void;
      onSshReady: (callback: (payload: SshEventPayload) => void) => () => void;
      onSshError: (callback: (payload: SshEventPayload) => void) => () => void;
      onSshClose: (callback: (payload: SshEventPayload) => void) => () => void;
      getSyslog: (site: Site) => Promise<{ ok: boolean; log: string }>;
      syncNvrTime: (site: Site) => Promise<{ ok: boolean; time: string }>;
      rebootNvr: (site: Site) => Promise<{ ok: boolean }>;
      discoverNvr: () => Promise<{ ok: boolean; recorders: DiscoveredNvr[] }>;
      applyNvrNetwork: (options: {
        ip: string;
        netmask: string;
        gateway: string;
        dns1: string;
        dns2: string;
        dhcp: boolean;
        mac: string;
      }) => Promise<{ ok: boolean; result: 'success' | 'fail' | 'unknown' }>;
      getNvrFileSend: (site: Site) => Promise<{ ok: boolean; isFileSend: boolean; serverAddress: string; ftpPort: number; ftpId: string; ftpPw: string; passive: boolean; defaultPath: string }>;
      setNvrFileSend: (options: {
        site: Site;
        enabled: boolean;
        manual?: {
          serverAddress: string;
          ftpPort: number;
          ftpId: string;
          ftpPw: string;
          defaultPath: string;
          passive: boolean;
        };
      }) => Promise<{ ok: boolean; enabled: boolean; serverAddress: string; ftpPort: number; ftpId: string; ftpPw: string; passive: boolean; defaultPath: string }>;
      getNvrFileDeleteTime: (site: Site) => Promise<{ ok: boolean; deleteUse: boolean; day: number; hour: number }>;
      setNvrFileDeleteTime: (options: { site: Site; deleteUse: boolean; day: number; hour: number }) => Promise<{ ok: boolean; deleteUse: boolean; day: number; hour: number }>;
      getNvrAdvancedConfig: (site: Site) => Promise<{ ok: boolean } & NvrAdvancedConfig>;
      setNvrAdvancedConfig: (options: {
        site: Site;
        config: {
          model: string;
          channels: NvrAdvancedChannel[];
        };
      }) => Promise<{ ok: boolean } & NvrAdvancedConfig>;
      getNvrAudioLevels: (site: Site) => Promise<{
        ok: boolean;
        channels: Array<{ channelNo: number; left: number; right: number }>;
      }>;
      openFieldlinkCamera: (site: Site) => Promise<{ ok: boolean; labDir: string; cameraListPath: string; pid?: number }>;
      openKatoCameraWeb: (site: Site) => Promise<{ ok: boolean }>;
      openNvrFirmwareWeb: (site: Site) => Promise<{ ok: boolean }>;
      getCrop: (site: Site) => Promise<{ ok: boolean; channels: CropChannel[]; raw: string }>;
      saveCrop: (options: { site: Site; channels: CropChannel[]; raw: string }) => Promise<{ ok: boolean }>;
      listFiles: (options: { site: SiteConnectionContext; path: string }) => Promise<SiteFileList>;
      previewFileDelete: (options: { id: string; site: SiteConnectionContext; path: string; isDirectory: boolean }) => Promise<DeletePreview>;
      deleteFile: (options: { id: string; site: SiteConnectionContext; preview: DeletePreview; password: string }) => Promise<DeleteResult>;
      cancelFileDelete: (id: string) => Promise<{ ok: boolean }>;
      onFileDeleteProgress: (callback: (progress: DeleteProgress & { id: string }) => void) => () => void;
      downloadFile: (options: {
        id: string;
        filename: string;
        site: Site;
        requestedPath: string;
        downloadDir?: string;
        size?: number;
      }) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; started?: boolean }>;
      prepareFileDrag: (options: {
        id: string;
        filename: string;
        site: Site;
        requestedPath: string;
        size?: number;
        modifiedAt?: string | null;
      }) => Promise<{ ok: boolean; filePath?: string; cached?: boolean; canceled?: boolean; error?: string }>;
      selectDownloadDir: () => Promise<{ ok: boolean; canceled?: boolean; dir?: string }>;
      openTransferLocation: (filePath: string) => Promise<{ ok: boolean }>;
      cancelDownload: (id: string) => Promise<{ ok: boolean }>;
      selectUploadFiles: () => Promise<{ ok: boolean; canceled?: boolean; files: DesktopUploadFile[] }>;
      registerDroppedFiles: (files: File[]) => Promise<{ ok: boolean; files: DesktopUploadFile[] }>;
      uploadFile: (options: {
        id: string;
        site: Site;
        localPath: string;
        remoteDir: string;
      }) => Promise<{ ok: boolean; started?: boolean }>;
      cancelUpload: (id: string) => Promise<{ ok: boolean }>;
      listPcFiles: (options: { site: SiteConnectionContext; path: string; offset?: number; sortBy?: 'name' | 'size' | 'modifiedAt'; descending?: boolean }) => Promise<{
        path: string;
        items: Array<{ name: string; path: string; isDirectory: boolean; size: number; modifiedAt: string | null }>;
        nextOffset: number | null;
      }>;
      registerDroppedPcFiles: (files: File[]) => Promise<{ ok: boolean; paths: string[] }>;
      uploadPcFile: (options: { id: string; site: SiteConnectionContext; directory: string; sourcePath?: string }) => Promise<{ ok?: boolean; canceled?: boolean; filename?: string }>;
      downloadPcFile: (options: { id: string; site: SiteConnectionContext; path: string }) => Promise<{ ok?: boolean; canceled?: boolean; filename?: string; filePath?: string }>;
      downloadPcFolder: (options: { id: string; site: SiteConnectionContext; path: string }) => Promise<{ ok?: boolean; canceled?: boolean; filename?: string; filePath?: string; skippedEntries?: number }>;
      previewPcFileDelete: (options: { id: string; site: SiteConnectionContext; path: string; isDirectory: boolean }) => Promise<DeletePreview>;
      deletePcFile: (options: { id: string; site: SiteConnectionContext; preview: DeletePreview }) => Promise<DeleteResult>;
      cancelPcFileDelete: (id: string) => Promise<{ ok: boolean }>;
      onPcFileDeleteProgress: (callback: (progress: DeleteProgress & { id: string }) => void) => () => void;
      cancelPcTransfer: (id: string) => Promise<{ ok: boolean }>;
      onPcTransferProgress: (callback: (progress: { id: string; direction: 'upload' | 'download'; bytes: number; total: number | null }) => void) => () => void;
      selectRecoveryVideo: (options?: { title?: string; buttonLabel?: string }) => Promise<{
        ok: boolean;
        canceled?: boolean;
        file?: DesktopUploadFile;
      }>;
      recoverVideo: (options: {
        id: string;
        samplePath: string;
        damagedPath: string;
        outputDir: string;
      }) => Promise<{ ok: boolean; started?: boolean }>;
      cancelRecovery: (id: string) => Promise<{ ok: boolean }>;
      onDownloadProgress: (callback: (progress: {
        id: string;
        direction?: DesktopTransferDirection;
        status: DesktopDownloadStatus;
        receivedBytes: number;
        totalBytes: number | null;
        percent: number | null;
        filePath?: string;
        error?: string;
      }) => void) => () => void;
      onUploadCompleted: (callback: (payload: { siteId: string; remoteDir: string }) => void) => () => void;
      setWindowAuthenticated: (authenticated: boolean) => Promise<{ ok: boolean }>;
      getAppInfo: () => Promise<DesktopAppInfo>;
      getTunnelClientStatus: () => Promise<'disabled' | 'not_installed' | 'needs_login' | 'offline' | 'online' | 'error'>;
      openTunnelClient: () => Promise<boolean>;
      downloadAppUpdate: () => Promise<{ ok: boolean }>;
      installAppUpdate: () => Promise<{ ok: boolean }>;
      onAppUpdateStatus: (callback: (info: DesktopAppInfo) => void) => () => void;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<{ maximized: boolean }>;
      closeWindow: () => Promise<void>;
    };
  }
}
