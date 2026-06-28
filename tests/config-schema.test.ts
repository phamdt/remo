import { describe, expect, it } from "vitest";
import {
  reposConfigSchema,
  workspacesConfigSchema,
} from "../src/config-schema.js";

const sampleRepos = [
  {
    id: "openclaw-api",
    name: "OpenClaw API",
    url: "git@github.com:your-org/openclaw-api.git",
    defaultBranch: "main",
    enabled: true,
  },
  {
    id: "openclaw-client",
    name: "OpenClaw Client",
    url: "git@github.com:your-org/openclaw-client.git",
    defaultBranch: "main",
    enabled: true,
  },
];

const sampleWorkspaces = [
  {
    id: "openclaw-fullstack",
    name: "OpenClaw Full Stack",
    repos: [
      { repoId: "openclaw-api", role: "api", path: "api" },
      { repoId: "openclaw-client", role: "client", path: "client" },
    ],
    defaultPromptContext: "Use api/ for the TS server and client/ for the KMP app.",
  },
];

describe("config schemas", () => {
  it("accepts spec example repos.json", () => {
    expect(reposConfigSchema.parse(sampleRepos)).toHaveLength(2);
  });

  it("accepts spec example workspaces.json", () => {
    expect(workspacesConfigSchema.parse(sampleWorkspaces)).toHaveLength(1);
  });

  it("rejects workspace referencing unknown repo ids at parse time when cross-checked", () => {
    const repos = reposConfigSchema.parse(sampleRepos);
    const workspaces = workspacesConfigSchema.parse(sampleWorkspaces);
    const repoIds = new Set(repos.map((r) => r.id));

    for (const ws of workspaces) {
      for (const ref of ws.repos) {
        expect(repoIds.has(ref.repoId)).toBe(true);
      }
    }
  });

  it("rejects empty workspace repo list", () => {
    expect(() =>
      workspacesConfigSchema.parse([
        { id: "empty", name: "Empty", repos: [] },
      ]),
    ).toThrow();
  });

  it("rejects workspace repo path with traversal", () => {
    expect(() =>
      workspacesConfigSchema.parse([
        {
          id: "bad",
          name: "Bad",
          repos: [{ repoId: "demo-api", role: "api", path: "../escape" }],
        },
      ]),
    ).toThrow();
  });

  it("rejects invalid defaultBranch in repos config", () => {
    expect(() =>
      reposConfigSchema.parse([
        {
          id: "demo-api",
          name: "Demo",
          url: "https://example.com/repo.git",
          defaultBranch: "-bad",
          enabled: true,
        },
      ]),
    ).toThrow();
  });
});
