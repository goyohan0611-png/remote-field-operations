import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export type DeletePreview = {
  path: string; isDirectory: boolean; files: number; directories: number; bytes: number; fingerprint: string;
};
export type DeleteProgress = { deleted: number; total: number };
export type DeleteResult = DeleteProgress & { status: 'completed' | 'canceled' | 'failed'; error?: string };
export type FtpDeleteEntry = {
  name: string; size: number; isFile: boolean; isDirectory: boolean; isSymbolicLink?: boolean;
  modifiedAt?: Date; rawModifiedAt?: string;
};
export type FtpDeleteClient = {
  list: (path: string) => Promise<FtpDeleteEntry[]>;
  remove: (path: string) => Promise<unknown>;
  removeEmptyDir: (path: string) => Promise<unknown>;
};
type PlannedEntry = { path: string; isDirectory: boolean; bytes: number; modified: string };
export type FtpDeletePlan = DeletePreview & { entries: PlannedEntry[] };
export class DeleteSafetyError extends Error {
  constructor(message: string, public readonly code = 'delete_rejected') { super(message); }
}
const MAX_ENTRIES = 10_000;
const MAX_BYTES = 50 * 1024 * 1024 * 1024;
const MAX_DEPTH = 128;

export function validateDeletePath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\x00-\x1f]/.test(value)
    || value.split('/').some(part => part === '.' || part === '..'))
    throw new DeleteSafetyError('삭제 경로가 올바르지 않습니다.');
  const path = posix.normalize(value).replace(/\/+$/, '') || '/';
  const lower = path.toLowerCase();
  if (path === '/' || lower === '/local' || ['/conf', '/lost+found'].some(root => lower === root || lower.startsWith(root + '/')))
    throw new DeleteSafetyError('녹화기 루트·설정·저장소 기본 폴더는 삭제할 수 없습니다.');
  return path;
}

function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new DeleteSafetyError('삭제가 중단됐습니다.', 'delete_canceled');
}

async function readEntries(client: FtpDeleteClient, directory: string, signal?: AbortSignal) {
  check(signal);
  const items = await client.list(directory);
  check(signal);
  if (items.length > 100_002) throw new DeleteSafetyError('삭제 검사 중 폴더 목록 제한을 초과했습니다.', 'delete_limit');
  const names = new Set<string>();
  return items.filter(item => item.name !== '.' && item.name !== '..').map(item => {
    if (!item.name || /[\\/\x00-\x1f]/.test(item.name) || names.has(item.name))
      throw new DeleteSafetyError('폴더 목록에 안전하게 확인할 수 없는 항목이 있습니다.');
    names.add(item.name);
    return item;
  });
}

export async function planFtpDelete(client: FtpDeleteClient, requestedPath: unknown, isDirectory: boolean,
  signal?: AbortSignal, limits = { entries: MAX_ENTRIES, bytes: MAX_BYTES, depth: MAX_DEPTH }): Promise<FtpDeletePlan> {
  const path = validateDeletePath(requestedPath);
  const startedAt = Date.now();
  const target = (await readEntries(client, posix.dirname(path), signal)).find(item => item.name === posix.basename(path));
  if (!target) throw new DeleteSafetyError('삭제할 항목이 없습니다.', 'delete_not_found');
  if (target.isDirectory !== isDirectory) throw new DeleteSafetyError('선택한 파일·폴더 종류가 변경됐습니다.');
  const entries: PlannedEntry[] = [];
  let files = 0, directories = 0, bytes = 0;
  const pending = [{ item: target, path, depth: 0 }];
  while (pending.length) {
    check(signal);
    if (Date.now() - startedAt > 60_000) throw new DeleteSafetyError('삭제 범위 검사 시간이 초과됐습니다.', 'delete_limit');
    const next = pending.pop()!;
    if (next.item.isSymbolicLink || (!next.item.isDirectory && !next.item.isFile))
      throw new DeleteSafetyError('연결된 항목이나 종류를 확인할 수 없는 항목은 삭제할 수 없습니다.');
    if (next.depth > limits.depth || entries.length >= limits.entries)
      throw new DeleteSafetyError('삭제 항목 또는 폴더 깊이 제한을 초과했습니다.', 'delete_limit');
    if (!next.item.isDirectory && (!Number.isSafeInteger(next.item.size) || next.item.size < 0))
      throw new DeleteSafetyError('파일 크기를 확인할 수 없어 삭제를 중단했습니다.');
    const size = next.item.isDirectory ? 0 : next.item.size;
    bytes += size;
    if (bytes > limits.bytes) throw new DeleteSafetyError('삭제 용량 제한(50GB)을 초과했습니다.', 'delete_limit');
    entries.push({ path: next.path, isDirectory: next.item.isDirectory, bytes: size,
      modified: next.item.modifiedAt?.toISOString() || next.item.rawModifiedAt || '' });
    if (next.item.isDirectory) {
      directories += 1;
      for (const item of await readEntries(client, next.path, signal)) {
        if (entries.length + pending.length >= limits.entries)
          throw new DeleteSafetyError('삭제 항목 제한(10,000개)을 초과했습니다.', 'delete_limit');
        pending.push({ item, path: posix.join(next.path, item.name), depth: next.depth + 1 });
      }
    } else files += 1;
  }
  if (Date.now() - startedAt > 60_000) throw new DeleteSafetyError('삭제 범위 검사 시간이 초과됐습니다.', 'delete_limit');
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const fingerprint = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  return { path, isDirectory, files, directories, bytes, fingerprint, entries };
}

export function previewFtpDelete(plan: FtpDeletePlan): DeletePreview {
  const { path, isDirectory, files, directories, bytes, fingerprint } = plan;
  return { path, isDirectory, files, directories, bytes, fingerprint };
}

export async function executeFtpDelete(client: FtpDeleteClient, expected: DeletePreview, signal?: AbortSignal,
  onProgress: (progress: DeleteProgress) => void = () => {}): Promise<DeleteResult> {
  let deleted = 0;
  const total = expected.files + expected.directories;
  try {
    // 확인 후 대상이 달라졌다면 한 항목도 삭제하지 않고 다시 확인을 요청한다.
    const current = await planFtpDelete(client, expected.path, expected.isDirectory, signal);
    if (current.fingerprint !== expected.fingerprint || current.files !== expected.files || current.directories !== expected.directories || current.bytes !== expected.bytes)
      throw new DeleteSafetyError('확인 후 대상 내용이 변경됐습니다. 다시 확인해주세요.', 'delete_changed');
    const ordered = [...current.entries].sort((a, b) => b.path.split('/').length - a.path.split('/').length || Number(a.isDirectory) - Number(b.isDirectory));
    onProgress({ deleted, total });
    for (const entry of ordered) {
      check(signal);
      if (entry.isDirectory) {
        // 새로 생긴 파일을 함께 지우지 않도록 빈 폴더만 삭제한다.
        if ((await readEntries(client, entry.path, signal)).length) throw new DeleteSafetyError('삭제 중 새 항목이 추가됐습니다. 남은 삭제를 중단했습니다.', 'delete_changed');
        await client.removeEmptyDir(entry.path);
      } else await client.remove(entry.path);
      deleted += 1;
      onProgress({ deleted, total });
    }
    return { status: 'completed', deleted, total };
  } catch (error) {
    return { status: signal?.aborted ? 'canceled' : 'failed', deleted, total,
      error: signal?.aborted ? '삭제를 중단했습니다.' : error instanceof Error ? error.message : '삭제에 실패했습니다.' };
  }
}
