import { z } from 'zod';

export const updateVersion = z.string().regex(/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/);

export function newerVersion(candidate: string, installed: string) {
  if (!updateVersion.safeParse(candidate).success || !updateVersion.safeParse(installed).success) return false;
  const right = installed.split('.').map(Number);
  for (const [index, part] of candidate.split('.').map(Number).entries()) {
    if (part !== right[index]!) return part > right[index]!;
  }
  return false;
}
