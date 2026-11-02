import type { SiteStatus } from '@fieldlink/shared';
import { randomUUID } from 'node:crypto';

export type AgentCommand = { command: 'refresh_status'; requestId: string };

type CommandWaiter = (command: AgentCommand | null) => void;
type StatusWaiter = (status: SiteStatus | undefined, requestId?: string) => void;

type RefreshBatch = { timer: ReturnType<typeof setTimeout>; requestId: string; requestIds: Set<string> };
const pendingRefreshes = new Map<string, RefreshBatch>();
const activeRefreshes = new Map<string, RefreshBatch>();
const commandWaiters = new Map<string, Set<CommandWaiter>>();
const statusWaiters = new Map<string, Set<StatusWaiter>>();

// 대기를 깨운 뒤 다음 요청에서 DB에 저장된 업데이트 명령을 먼저 확인한다.
export function wakeAgentCommandWait(siteId: string) {
  for (const waiter of [...(commandWaiters.get(siteId) ?? [])]) waiter(null);
}

function addWaiter<T>(waiters: Map<string, Set<T>>, siteId: string, waiter: T) {
  const siteWaiters = waiters.get(siteId) ?? new Set<T>();
  siteWaiters.add(waiter);
  waiters.set(siteId, siteWaiters);
}

function removeWaiter<T>(waiters: Map<string, Set<T>>, siteId: string, waiter: T) {
  const siteWaiters = waiters.get(siteId);
  if (!siteWaiters) return;
  siteWaiters.delete(waiter);
  if (siteWaiters.size === 0) waiters.delete(siteId);
}

export function requestAgentStatusRefresh(siteIds: string[], requestId = randomUUID()) {
  let requested = 0;
  for (const siteId of new Set(siteIds)) {
    requested += 1;
    const pending = pendingRefreshes.get(siteId);
    if (pending) {
      // 아직 측정하지 않은 요청만 합친다. 이미 시작된 측정으로 뒤늦은 요청을 완료하지 않는다.
      pending.requestIds.add(requestId);
    } else {
      const timer = setTimeout(() => pendingRefreshes.delete(siteId), 60_000);
      timer.unref();
      pendingRefreshes.set(siteId, { timer, requestId, requestIds: new Set([requestId]) });
    }
    dispatchPending(siteId);
  }
  return requested;
}

function activatePending(siteId: string): AgentCommand | undefined {
  if (activeRefreshes.has(siteId)) return undefined;
  const batch = pendingRefreshes.get(siteId);
  if (!batch) return undefined;
  clearTimeout(batch.timer);
  pendingRefreshes.delete(siteId);
  batch.timer = setTimeout(() => {
    activeRefreshes.delete(siteId);
    dispatchPending(siteId);
  }, 25_000);
  batch.timer.unref();
  activeRefreshes.set(siteId, batch);
  return { command: 'refresh_status', requestId: batch.requestId };
}

function dispatchPending(siteId: string) {
  const waiter = commandWaiters.get(siteId)?.values().next().value as CommandWaiter | undefined;
  if (!waiter) return;
  const command = activatePending(siteId);
  if (command) waiter(command);
}

export function waitForAgentCommand(
  siteId: string,
  timeoutMs = 25_000,
  signal?: AbortSignal,
): Promise<AgentCommand | null> {
  const pending = activatePending(siteId);
  if (pending) return Promise.resolve(pending);

  // 한 현장 에이전트에는 활성 명령 대기 연결을 하나만 유지한다.
  for (const existing of [...(commandWaiters.get(siteId) ?? [])]) existing(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish: CommandWaiter = (command) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      removeWaiter(commandWaiters, siteId, finish);
      resolve(command);
    };
    const abort = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);
    addWaiter(commandWaiters, siteId, finish);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export function notifyAgentStatusUpdated(status: SiteStatus, requestId?: string) {
  const batch = activeRefreshes.get(status.siteId);
  const requestIds = batch && batch.requestId === requestId ? batch.requestIds : new Set([requestId]);
  const waiters = [...(statusWaiters.get(status.siteId) ?? [])];
  for (const id of requestIds) for (const waiter of waiters) waiter(status, id);
  if (batch && batch.requestId === requestId) {
    clearTimeout(batch.timer);
    activeRefreshes.delete(status.siteId);
    dispatchPending(status.siteId);
  }
}

export function waitForAgentStatusUpdate(
  siteId: string,
  requestId: string,
  timeoutMs = 25_000,
): Promise<SiteStatus | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish: StatusWaiter = (status, responseId) => {
      if (settled) return;
      if (status && responseId !== requestId) return;
      settled = true;
      clearTimeout(timer);
      removeWaiter(statusWaiters, siteId, finish);
      resolve(status);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    addWaiter(statusWaiters, siteId, finish);
  });
}
