import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { CreateRunRequest } from "../api-schema.js";
import { getRepoById, getWorkspaceById, loadWorkspaces } from "../config/loader.js";
import { RunDatabase } from "../db/client.js";
import { agentRunner, type AgentRunner } from "../agent/runner.js";
import { createPullRequest } from "../git/publish.js";
import {
  addWorktree,
  commitAllIfDirty,
  ensureBareRepoCache,
  hasChanges,
  pushBranch,
} from "../git/worktree.js";
import { safeEqualToken } from "../middleware/auth.js";
import {
  getDbPath,
  getRepoCacheDir,
  runBranchesPath,
  runCursorStateDir,
  runDir,
  runEventsPath,
  runResultHandle,
  runResultPath,
  runWorkspaceDir,
} from "../paths.js";
import { clientErrorMessage } from "../security/errors.js";
import { getMaxConcurrentRuns, getRunTimeoutMs } from "../security/limits.js";
import type { AppSecrets } from "../security/secrets.js";
import { runEventBus } from "./event-bus.js";
import type { RunRecord, RunRepoRow, RunStatus, RunSummary } from "../types.js";

type ActiveRun = {
  abortController: AbortController;
  promise: Promise<void>;
};

export type RunServiceDeps = {
  db: RunDatabase;
  runner: AgentRunner;
  secrets: AppSecrets;
  configDir?: string;
  repoCacheDir?: string;
  timeoutMs?: number;
  maxConcurrentRuns?: number;
};

export class RunService {
  private readonly db: RunDatabase;
  private readonly runner: AgentRunner;
  private readonly secrets: AppSecrets;
  private readonly configDir?: string;
  private readonly repoCacheDir: string;
  private readonly timeoutMs: number;
  private readonly maxConcurrentRuns: number;
  private readonly active = new Map<string, ActiveRun>();

  constructor(deps: RunServiceDeps) {
    this.db = deps.db;
    this.runner = deps.runner;
    this.secrets = deps.secrets;
    this.configDir = deps.configDir;
    this.repoCacheDir = deps.repoCacheDir ?? getRepoCacheDir();
    this.timeoutMs = deps.timeoutMs ?? getRunTimeoutMs();
    this.maxConcurrentRuns = deps.maxConcurrentRuns ?? getMaxConcurrentRuns();
  }

  listWorkspaces() {
    return loadWorkspaces(this.configDir).map((w) => ({
      id: w.id,
      name: w.name,
      repos: w.repos.map((r) => ({
        repoId: r.repoId,
        role: r.role,
        path: r.path,
      })),
      defaultPromptContext: w.defaultPromptContext,
    }));
  }

  createRun(request: CreateRunRequest, bearerToken: string): { id: string } {
    if (!this.secrets.cursorApiKey) {
      throw new Error("CURSOR_API_KEY is not configured");
    }

    if (
      request.mode === "apply" &&
      this.secrets.remoteAgentApplyToken &&
      !safeEqualToken(bearerToken, this.secrets.remoteAgentApplyToken)
    ) {
      throw new Error("Apply mode requires REMOTE_AGENT_APPLY_TOKEN");
    }

    if (this.active.size >= this.maxConcurrentRuns) {
      throw new Error("Too many concurrent runs");
    }

    const workspace = getWorkspaceById(request.workspaceId, this.configDir);
    const id = `run_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const now = new Date().toISOString();
    const runPath = runDir(id);
    const cursorStatePath = runCursorStateDir(id);
    const workspaceRoot = runWorkspaceDir(id);

    fs.mkdirSync(cursorStatePath, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const repoRows: RunRepoRow[] = workspace.repos.map((ref) => {
      const repo = getRepoById(ref.repoId, this.configDir);
      return {
        repoId: ref.repoId,
        role: ref.role,
        path: ref.path,
        baseRef: request.baseRef ?? repo.defaultBranch,
        branch: null,
        prUrl: null,
      };
    });

    const record: RunRecord = {
      id,
      workspaceId: workspace.id,
      status: "queued",
      mode: request.mode,
      runPath,
      cursorStatePath,
      createdAt: now,
      updatedAt: now,
    };

    this.db.insertRun(record, repoRows);
    this.startRun(id, request.prompt, workspace.defaultPromptContext);
    return { id };
  }

  continueRun(id: string, prompt: string): void {
    const run = this.requireRun(id);
    if (this.active.has(id) || run.status === "running") {
      throw new Error("Run is already active");
    }
    if (!["completed", "failed", "cancelled"].includes(run.status)) {
      throw new Error(`Cannot continue run in status ${run.status}`);
    }
    if (this.active.size >= this.maxConcurrentRuns) {
      throw new Error("Too many concurrent runs");
    }
    const workspace = getWorkspaceById(run.workspaceId, this.configDir);
    this.updateStatus(id, "queued");
    this.startRun(id, prompt, workspace.defaultPromptContext);
  }

  cancelRun(id: string): void {
    const active = this.active.get(id);
    if (active) {
      active.abortController.abort();
    }
    this.finalizeRun(id, "cancelled");
    runEventBus.publish(
      id,
      { type: "result", ok: false },
      runEventsPath(id),
    );
  }

  getSummary(id: string): RunSummary | null {
    const run = this.db.getRun(id);
    if (!run) {
      return null;
    }
    const repos = this.db.listRunRepos(id);
    const resultExists = fs.existsSync(runResultPath(id));
    return {
      id: run.id,
      workspaceId: run.workspaceId,
      status: run.status,
      mode: run.mode,
      repos: repos.map((r) => ({
        repoId: r.repoId,
        role: r.role,
        path: r.path,
        branch: r.branch ?? undefined,
        prUrl: r.prUrl ?? undefined,
      })),
      resultPath: resultExists ? runResultHandle(id) : undefined,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  private requireRun(id: string): RunRecord {
    const run = this.db.getRun(id);
    if (!run) {
      throw new Error(`Run not found: ${id}`);
    }
    return run;
  }

  private updateStatus(id: string, status: RunStatus): void {
    const updatedAt = new Date().toISOString();
    this.db.updateStatus(id, status, updatedAt);
    runEventBus.publish(id, { type: "status", status }, runEventsPath(id));
  }

  private finalizeRun(id: string, status: RunStatus): void {
    this.updateStatus(id, status);
    if (["completed", "failed", "cancelled"].includes(status)) {
      runEventBus.dispose(id);
    }
  }

  private startRun(
    id: string,
    prompt: string,
    promptContext?: string,
  ): void {
    if (this.active.has(id)) {
      throw new Error("Run is already active");
    }

    const run = this.requireRun(id);
    const abortController = new AbortController();
    const promise = this.executeRun(
      run,
      prompt,
      promptContext,
      abortController.signal,
    ).finally(() => {
      this.active.delete(id);
    });

    this.active.set(id, { abortController, promise });
  }

  private async executeRun(
    run: RunRecord,
    prompt: string,
    promptContext: string | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      this.updateStatus(run.id, "running");
      await this.prepareWorktrees(run);

      const result = await this.runner.run({
        runId: run.id,
        workspaceRoot: runWorkspaceDir(run.id),
        cursorStatePath: run.cursorStatePath,
        mode: run.mode,
        prompt,
        promptContext,
        eventsPath: runEventsPath(run.id),
        modelId: this.secrets.modelId,
        apiKey: this.secrets.cursorApiKey,
        timeoutMs: this.timeoutMs,
        signal,
      });

      if (signal.aborted || result.error === "cancelled") {
        this.finalizeRun(run.id, "cancelled");
        runEventBus.publish(
          run.id,
          { type: "result", ok: false },
          runEventsPath(run.id),
        );
        return;
      }

      if (!result.ok) {
        this.finalizeRun(run.id, "failed");
        runEventBus.publish(
          run.id,
          {
            type: "error",
            message: result.error ?? "Run failed",
          },
          runEventsPath(run.id),
        );
        runEventBus.publish(
          run.id,
          { type: "result", ok: false },
          runEventsPath(run.id),
        );
        return;
      }

      if (signal.aborted) {
        this.finalizeRun(run.id, "cancelled");
        runEventBus.publish(
          run.id,
          { type: "result", ok: false },
          runEventsPath(run.id),
        );
        return;
      }

      fs.writeFileSync(
        runResultPath(run.id),
        JSON.stringify({ ok: true, result: result.resultText ?? "" }, null, 2),
        "utf8",
      );

      if (run.mode === "apply" && !signal.aborted) {
        await this.publishChanges(run, signal);
      }

      if (signal.aborted) {
        this.finalizeRun(run.id, "cancelled");
        runEventBus.publish(
          run.id,
          { type: "result", ok: false },
          runEventsPath(run.id),
        );
        return;
      }

      this.finalizeRun(run.id, "completed");
      runEventBus.publish(
        run.id,
        { type: "result", ok: true },
        runEventsPath(run.id),
      );
    } catch (error) {
      this.finalizeRun(run.id, "failed");
      runEventBus.publish(
        run.id,
        { type: "error", message: clientErrorMessage(error, "run") },
        runEventsPath(run.id),
      );
      runEventBus.publish(
        run.id,
        { type: "result", ok: false },
        runEventsPath(run.id),
      );
    }
  }

  private async prepareWorktrees(run: RunRecord): Promise<void> {
    const repos = this.db.listRunRepos(run.id);
    for (const row of repos) {
      const repo = getRepoById(row.repoId, this.configDir);
      const barePath = await ensureBareRepoCache(
        row.repoId,
        repo.url,
        this.repoCacheDir,
      );
      const branch = `cursor/${run.id}-${row.role}`;
      const worktreePath = path.join(runWorkspaceDir(run.id), row.path);
      const baseRef = `origin/${row.baseRef}`;
      await addWorktree(barePath, worktreePath, branch, baseRef);
      this.db.updateRunRepoBranch(run.id, row.repoId, branch, null);
    }
  }

  private async publishChanges(
    run: RunRecord,
    signal: AbortSignal,
  ): Promise<void> {
    const repos = this.db.listRunRepos(run.id);
    const branches: Record<string, { branch: string; prUrl?: string }> = {};

    for (const row of repos) {
      if (signal.aborted) {
        return;
      }

      const worktreePath = path.join(runWorkspaceDir(run.id), row.path);
      const branch = row.branch ?? `cursor/${run.id}-${row.role}`;
      const dirty = await hasChanges(worktreePath);
      if (!dirty) {
        continue;
      }

      await commitAllIfDirty(worktreePath, `cursor: ${run.id} (${row.role})`);

      if (signal.aborted) {
        return;
      }

      await pushBranch(worktreePath, branch);

      if (signal.aborted) {
        return;
      }

      const prUrl = await createPullRequest({
        cwd: worktreePath,
        branch,
        base: row.baseRef,
        title: `Cursor run ${run.id} (${row.role})`,
        body: `Automated changes from remote agent run \`${run.id}\`.`,
      });

      this.db.updateRunRepoBranch(run.id, row.repoId, branch, prUrl);
      branches[row.repoId] = { branch, prUrl: prUrl ?? undefined };
    }

    if (!signal.aborted) {
      fs.writeFileSync(
        runBranchesPath(run.id),
        JSON.stringify(branches, null, 2),
        "utf8",
      );
    }
  }
}

export function createRunService(secrets: AppSecrets): RunService {
  fs.mkdirSync(path.dirname(getDbPath()), { recursive: true });
  const db = new RunDatabase(getDbPath());
  return new RunService({ db, runner: agentRunner, secrets });
}
