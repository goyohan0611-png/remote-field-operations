import { z } from 'zod';

const optionalValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => value === null ? undefined : value, schema.optional());
const deviceStatus = z.enum(['online', 'offline', 'unknown', 'skipped']);

export const agentHealthSchema = z.object({
  checks: z.object({
    nvr: deviceStatus, rtsp: deviceStatus, ftp: deviceStatus,
    ssh: deviceStatus, rdp: deviceStatus, cam: deviceStatus,
  }),
  isRecording: optionalValue(z.boolean()),
  hddUsedPct: optionalValue(z.number().min(0).max(100)),
  firmwareVersion: optionalValue(z.string().trim().max(50)),
  recorderTime: optionalValue(z.string().trim().max(30)),
  recorderTimeDiff: optionalValue(z.number().int()),
  measuredAt: optionalValue(z.string().datetime({ offset: true })),
});

export const agentIdentitySchema = z.object({
  edition: z.enum(['stable', 'tunnel-preview']).default('stable'),
  machineId: z.string().trim().min(1).max(255),
  hostname: z.string().trim().min(1).max(255),
  version: z.string().trim().min(1).max(50),
  localIp: optionalValue(z.string().trim().max(100)),
  bootId: optionalValue(z.string().trim().max(255)),
  tunnel: optionalValue(z.object({
    state: z.enum(['disabled', 'not_installed', 'online', 'needs_login', 'offline', 'error']),
    ipv4: optionalValue(z.string().trim().max(100)),
    ipv6: optionalValue(z.string().trim().max(100)),
  })),
  health: optionalValue(agentHealthSchema),
  refreshRequestId: optionalValue(z.string().uuid()),
  updaterImmediateSupported: optionalValue(z.boolean()),
  siteSettings: optionalValue(z.object({
    shutdown: optionalValue(z.object({
      enabled: z.boolean(),
      startTime: optionalValue(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)),
    }).superRefine((value, context) => {
      if (value.enabled && !value.startTime) context.addIssue({ code: 'custom', message: 'shutdown_start_required' });
    })),
    cloud: optionalValue(z.object({
      enabled: z.boolean(),
      orgCode: optionalValue(z.string().regex(/^[a-z0-9_-]{1,100}$/)),
    })),
  })),
});
