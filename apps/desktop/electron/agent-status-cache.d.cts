import type { SiteAgentStatus } from '@fieldlink/shared';
declare const cache: {
  STATUS_TTL_MS: number;
  createAgentStatusCache: (now?: () => number) => {
    observe: (statuses: Record<string, SiteAgentStatus>, replace?: boolean) => void;
    read: (siteId: string) => SiteAgentStatus | undefined;
    disconnect: () => void;
    clear: () => void;
    snapshot: () => Record<string, SiteAgentStatus>;
  };
};
export = cache;
