import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRunner, AgentRunnerOptions, AgentRunnerResult } from "../src/agent/runner.js";
import { RunDatabase } from "../src/db/client.js";
import {
  ApplyTokenRequiredError,
  RunNotFoundError,
  TooManyConcurrentRunsError,
} from "../src/errors.js";
import { RunService } from "../src/services/run-service.js";
import type { AppSecrets } from "../src/security/secrets.js";

const secrets: AppSecrets = {
  remoteAgentToken: "read-token",
  remoteAgentApplyToken: "apply-token",
  cursorApiKey: "cursor-key",
  modelId: "test-model",
};

function mockRunner(
  impl?: (options: AgentRunnerOptions) => Promise<AgentRunnerResult>,
): AgentRunner {
  return {
    run:
      impl ??
      (async () => ({
        ok: true,
        resultText: "done",
      })),
  } as AgentRunner;
}

describe("RunService", () => {
  const tempDirs: string[] = [];
  let configDir = "";
  let dataDir = "";

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.REMOTE_AGENT_DATA;
  });

  function setup(config?: {
    runner?: AgentRunner;
    maxConcurrentRuns?: number;
    applyToken?: string;
  }) {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-svc-"));
    tempDirs.push(dataDir);
    configDir = path.join(dataDir, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "repos.json"),
      JSON.stringify([
        {
          id: "demo-api",
          name: "Demo",
          url: "https://github.com/octocat/Hello-World.git",
          defaultBranch: "master",
          enabled: true,
        },
      ]),
    );
    fs.writeFileSync(
      path.join(configDir, "workspaces.json"),
      JSON.stringify([
        {
          id: "demo-workspace",
          name: "Demo",
          repos: [{ repoId: "demo-api", role: "api", path: "api" }],
        },
      ]),
    );
    process.env.REMOTE_AGENT_DATA = dataDir;

    const dbPath = path.join(dataDir, "data", "runs.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new RunDatabase(dbPath);
    const service = new RunService({
      db,
      runner: config?.runner ?? mockRunner(),
      secrets: {
        ...secrets,
        remoteAgentApplyToken:
          config?.applyToken === undefined
            ? secrets.remoteAgentApplyToken
            : config.applyToken,
      },
      configDir,
      repoCacheDir: path.join(dataDir, "repo-cache"),
      maxConcurrentRuns: config?.maxConcurrentRuns ?? 2,
      timeoutMs: 5_000,
    });

    return { service, db };
  }

  it("rejects apply mode without apply token", () => {
    const { service } = setup();
    expect(() =>
      service.createRun(
        {
          workspaceId: "demo-workspace",
          mode: "apply",
          prompt: "change things",
        },
        "read-token",
      ),
    ).toThrow(ApplyTokenRequiredError);
  });

  it("rejects continue on apply run without apply token", async () => {
    const { service } = setup({
      runner: mockRunner(async () => ({ ok: true, resultText: "ok" })),
    });

    vi.spyOn(service as unknown as { prepareWorktrees: () => Promise<void> }, "prepareWorktrees")
      .mockResolvedValue(undefined);
    vi.spyOn(service as unknown as { publishChanges: () => Promise<void> }, "publishChanges")
      .mockResolvedValue(undefined);

    const { id } = service.createRun(
      {
        workspaceId: "demo-workspace",
        mode: "apply",
        prompt: "first",
      },
      "apply-token",
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(() => service.continueRun(id, "second", "read-token")).toThrow(
      ApplyTokenRequiredError,
    );
  });

  it("enforces max concurrent runs", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const { service } = setup({
      maxConcurrentRuns: 1,
      runner: mockRunner(async () => {
        await gate;
        return { ok: true, resultText: "ok" };
      }),
    });

    vi.spyOn(
      service as unknown as { prepareWorktrees: () => Promise<void> },
      "prepareWorktrees",
    ).mockResolvedValue(undefined);

    service.createRun(
      { workspaceId: "demo-workspace", mode: "plan_only", prompt: "one" },
      "read-token",
    );

    expect(() =>
      service.createRun(
        { workspaceId: "demo-workspace", mode: "plan_only", prompt: "two" },
        "read-token",
      ),
    ).toThrow(TooManyConcurrentRunsError);

    releaseFirst();
    await new Promise((r) => setTimeout(r, 30));
  });

  it("cancel only aborts in-flight run without racing to completed", async () => {
    let capturedSignal: AbortSignal | undefined;
    let releaseAgent!: () => void;
    const agentGate = new Promise<void>((resolve) => {
      releaseAgent = resolve;
    });

    const { service } = setup({
      runner: mockRunner(async (options) => {
        capturedSignal = options.signal;
        await agentGate;
        return { ok: true, resultText: "should not win" };
      }),
    });

    vi.spyOn(
      service as unknown as { prepareWorktrees: () => Promise<void> },
      "prepareWorktrees",
    ).mockResolvedValue(undefined);

    const { id } = service.createRun(
      { workspaceId: "demo-workspace", mode: "plan_only", prompt: "work" },
      "read-token",
    );

    await new Promise((r) => setTimeout(r, 20));
    service.cancelRun(id);
    expect(capturedSignal?.aborted).toBe(true);

    releaseAgent();
    await new Promise((r) => setTimeout(r, 50));

    const summary = service.getSummary(id);
    expect(summary?.status).toBe("cancelled");
  });

  it("cancel on unknown run throws not found", () => {
    const { service } = setup();
    expect(() => service.cancelRun("run_missing")).toThrow(RunNotFoundError);
  });
});
