// Optional enrichment can wait. Repeated missing data must not consume the
// free KV write allowance every hour.
export function enrichmentRetryWait(meta) {
  if (meta.accessUnavailable) return 86400000;
  return Math.min(86400000, 3600000 * 2 ** Math.min(5, Math.max(0, (meta.failures || 0) - 1)));
}
