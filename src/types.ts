export type RunMode = "plan_only" | "apply";
export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type SseEvent =
  | { type: "status"; status: RunStatus }
  | { type: "log"; message: string }
  | { type: "tool"; name: string; summary?: string }
  | { type: "result"; ok: boolean }
  | { type: "error"; message: string };

export type RunRepoRow = {
  repoId: string;
  role: string;
  path: string;
  baseRef: string;
  branch: string | null;
  prUrl: string | null;
};

export type RunRecord = {
  id: string;
  workspaceId: string;
  status: RunStatus;
  mode: RunMode;
  runPath: string;
  cursorStatePath: string;
  createdAt: string;
  updatedAt: string;
};

export type RunSummary = {
  id: string;
  workspaceId: string;
  status: RunStatus;
  mode: RunMode;
  repos: Array<{
    repoId: string;
    role: string;
    path: string;
    branch?: string;
    prUrl?: string;
  }>;
  resultPath?: string;
  createdAt: string;
  updatedAt: string;
};
