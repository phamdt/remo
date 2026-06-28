import fs from "node:fs";
import path from "node:path";
import {
  reposConfigSchema,
  workspacesConfigSchema,
  type Repo,
  type Workspace,
} from "../config-schema.js";
import { getConfigDir } from "../paths.js";

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

export function loadRepos(configDir = getConfigDir()): Repo[] {
  const filePath = path.join(configDir, "repos.json");
  return reposConfigSchema.parse(readJsonFile(filePath));
}

export function loadWorkspaces(configDir = getConfigDir()): Workspace[] {
  const filePath = path.join(configDir, "workspaces.json");
  const workspaces = workspacesConfigSchema.parse(readJsonFile(filePath));
  const repos = loadRepos(configDir);
  const repoIds = new Set(repos.filter((r) => r.enabled).map((r) => r.id));

  for (const workspace of workspaces) {
    for (const ref of workspace.repos) {
      if (!repoIds.has(ref.repoId)) {
        throw new Error(
          `Workspace ${workspace.id} references unknown or disabled repo ${ref.repoId}`,
        );
      }
    }
  }

  return workspaces;
}

export function getWorkspaceById(
  workspaceId: string,
  configDir = getConfigDir(),
): Workspace {
  const workspace = loadWorkspaces(configDir).find((w) => w.id === workspaceId);
  if (!workspace) {
    throw new Error(`Unknown workspace: ${workspaceId}`);
  }
  return workspace;
}

export function getRepoById(repoId: string, configDir = getConfigDir()): Repo {
  const repo = loadRepos(configDir).find((r) => r.id === repoId && r.enabled);
  if (!repo) {
    throw new Error(`Unknown or disabled repo: ${repoId}`);
  }
  return repo;
}
