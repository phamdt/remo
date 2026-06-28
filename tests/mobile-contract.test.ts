import { describe, expect, it } from "vitest";
import { createV1Routes } from "../src/routes/v1.js";
import type { RunService } from "../src/services/run-service.js";

/**
 * Contract shapes expected by remomo (RemoteAgentApi.kt / ApiModels.kt).
 * Keeps remo responses compatible with the KMP client without a live Android build.
 */
const token = "mobile-contract-token";
const auth = { Authorization: `Bearer ${token}` };

function mockRunService(): RunService {
  return {
    listWorkspaces: () => [
      {
        id: "demo-workspace",
        name: "Demo Workspace",
        repos: [{ repoId: "demo-api", role: "api", path: "api" }],
        defaultPromptContext: "The repository lives under api/.",
      },
    ],
    createRun: () => ({ id: "run_contract_1" }),
    getSummary: (id: string) =>
      id === "run_contract_1"
        ? {
            id: "run_contract_1",
            workspaceId: "demo-workspace",
            status: "completed",
            mode: "plan_only",
            repos: [
              {
                repoId: "demo-api",
                role: "api",
                path: "api",
                branch: "agent/run_contract_1",
                prUrl: "https://github.com/example/repo/pull/1",
              },
            ],
            resultPath: "runs/run_contract_1/result.md",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
          }
        : null,
    continueRun: () => undefined,
    cancelRun: () => undefined,
  } as RunService;
}

describe("remomo mobile contract", () => {
  const app = createV1Routes(mockRunService(), token);

  it("GET /workspaces matches WorkspacesResponse + WorkspaceDto", async () => {
    const res = await app.request("/workspaces", { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      workspaces: Array<{
        id: string;
        name: string;
        repos: Array<{ repoId: string; role: string; path: string }>;
        defaultPromptContext?: string;
      }>;
    };
    expect(body.workspaces[0]).toMatchObject({
      id: "demo-workspace",
      name: "Demo Workspace",
      repos: [{ repoId: "demo-api", role: "api", path: "api" }],
    });
    expect(typeof body.workspaces[0].defaultPromptContext).toBe("string");
  });

  it("POST /runs accepts CreateRunRequest and returns CreateRunResponse", async () => {
    const res = await app.request("/runs", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "demo-workspace",
        mode: "plan_only",
        prompt: "Summarize the repo",
        baseRef: "main",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body).toEqual({ id: "run_contract_1" });
  });

  it("GET /runs/:id matches RunSummaryDto", async () => {
    const res = await app.request("/runs/run_contract_1", { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      workspaceId: string;
      status: string;
      mode: string;
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
    expect(body.status).toBe("completed");
    expect(body.mode).toBe("plan_only");
    expect(body.repos[0].branch).toBe("agent/run_contract_1");
    expect(body.repos[0].prUrl).toMatch(/^https:\/\//);
  });

  it("POST /runs/:id/continue returns OkResponse", async () => {
    const res = await app.request("/runs/run_contract_1/continue", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Add tests" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("POST /runs/:id/cancel returns OkResponse", async () => {
    const res = await app.request("/runs/run_contract_1/cancel", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects apply/plan_only mode typos remomo would not send", async () => {
    const res = await app.request("/runs", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "demo-workspace",
        mode: "PLAN_ONLY",
        prompt: "bad mode",
      }),
    });
    expect(res.status).toBe(400);
  });
});
