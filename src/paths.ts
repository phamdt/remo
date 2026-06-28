import path from "node:path";

export function getDataRoot(): string {
  return process.env.REMOTE_AGENT_DATA ?? process.cwd();
}

export function getConfigDir(): string {
  return path.join(getDataRoot(), "config");
}

export function getDbPath(): string {
  return path.join(getDataRoot(), "data", "runs.sqlite");
}

export function getRunsDir(): string {
  return path.join(getDataRoot(), "runs");
}

export function getRepoCacheDir(): string {
  return path.join(getDataRoot(), "repo-cache");
}

export function runDir(runId: string): string {
  return path.join(getRunsDir(), runId);
}

export function runWorkspaceDir(runId: string): string {
  return path.join(runDir(runId), "workspace");
}

export function runCursorStateDir(runId: string): string {
  return path.join(runDir(runId), "cursor-state");
}

export function runEventsPath(runId: string): string {
  return path.join(runDir(runId), "events.jsonl");
}

export function runResultPath(runId: string): string {
  return path.join(runDir(runId), "result.json");
}

/** Opaque client-facing handle — not an absolute filesystem path. */
export function runResultHandle(runId: string): string {
  return `runs/${runId}/result`;
}

export function runBranchesPath(runId: string): string {
  return path.join(runDir(runId), "branches.json");
}

export function runAgentMetaPath(runId: string): string {
  return path.join(runDir(runId), "agent-meta.json");
}
