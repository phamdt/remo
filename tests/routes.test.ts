import { describe, expect, it } from "vitest";
import { createV1Routes } from "../src/routes/v1.js";
import type { RunService } from "../src/services/run-service.js";

function mockRunService(overrides: Partial<RunService> = {}): RunService {
  return {
    listWorkspaces: () => [
      {
        id: "demo-workspace",
        name: "Demo",
        repos: [{ repoId: "demo-api", role: "api", path: "api" }],
      },
    ],
    createRun: () => ({ id: "run_123" }),
    getSummary: (id: string) =>
      id === "run_123"
        ? {
            id: "run_123",
            workspaceId: "demo-workspace",
            status: "completed",
            mode: "plan_only",
            repos: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }
        : null,
    continueRun: () => undefined,
    cancelRun: () => undefined,
    ...overrides,
  } as RunService;
}

describe("v1 routes", () => {
  const token = "test-token";
  const auth = { Authorization: "Bearer test-token" };

  it("rejects missing auth", async () => {
    const app = createV1Routes(mockRunService(), token);
    const res = await app.request("/workspaces");
    expect(res.status).toBe(401);
  });

  it("lists workspaces", async () => {
    const app = createV1Routes(mockRunService(), token);
    const res = await app.request("/workspaces", { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workspaces: unknown[] };
    expect(body.workspaces).toHaveLength(1);
  });

  it("creates a run", async () => {
    const app = createV1Routes(mockRunService(), token);
    const res = await app.request("/runs", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "demo-workspace",
        mode: "plan_only",
        prompt: "Summarize the repo",
      }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "run_123" });
  });

  it("returns run summary", async () => {
    const app = createV1Routes(mockRunService(), token);
    const res = await app.request("/runs/run_123", { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("run_123");
  });

  it("rejects invalid baseRef in create run request", async () => {
    const app = createV1Routes(mockRunService(), token);
    const res = await app.request("/runs", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "demo-workspace",
        mode: "plan_only",
        prompt: "Summarize the repo",
        baseRef: "../escape",
      }),
    });
    expect(res.status).toBe(400);
  });
});
