export function getMaxConcurrentRuns(): number {
  const raw = process.env.MAX_CONCURRENT_RUNS ?? "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 3;
  }
  return Math.floor(parsed);
}

export function getRunTimeoutMs(): number {
  const raw = process.env.RUN_TIMEOUT_MS ?? "1800000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60_000) {
    return 1_800_000;
  }
  return Math.floor(parsed);
}
