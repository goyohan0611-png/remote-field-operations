export const NVR_AUDIO_POLL_INTERVAL_MS = 500;
export const NVR_AUDIO_POLL_MAX_INTERVAL_MS = 2000;

export function getNvrAudioPollDelay(consecutiveFailures: number) {
  const failures = Math.max(0, Math.floor(consecutiveFailures));
  return Math.min(
    NVR_AUDIO_POLL_INTERVAL_MS * (2 ** failures),
    NVR_AUDIO_POLL_MAX_INTERVAL_MS,
  );
}
