import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildGitEnv } from "../security/env.js";

export type GitExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

export async function git(
  args: string[],
  cwd?: string,
): Promise<GitExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: buildGitEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export async function ensureBareRepoCache(
  repoId: string,
  url: string,
  cacheDir: string,
): Promise<string> {
  const barePath = path.join(cacheDir, `${repoId}.git`);
  if (!fs.existsSync(barePath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const clone = await git(["clone", "--bare", url, barePath]);
    if (clone.code !== 0) {
      throw new GitCommandError(`git clone failed for ${repoId}`, clone.stderr);
    }
  } else {
    const fetch = await git(["fetch", "--prune", "origin"], barePath);
    if (fetch.code !== 0) {
      throw new GitCommandError(`git fetch failed for ${repoId}`, fetch.stderr);
    }
  }
  return barePath;
}

export async function addWorktree(
  barePath: string,
  worktreePath: string,
  branch: string,
  baseRef: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  if (fs.existsSync(worktreePath)) {
    return;
  }

  const add = await git(
    ["worktree", "add", "-B", branch, worktreePath, baseRef],
    barePath,
  );
  if (add.code !== 0) {
    throw new GitCommandError("git worktree add failed", add.stderr);
  }
}

export async function hasChanges(worktreePath: string): Promise<boolean> {
  const status = await git(["status", "--porcelain"], worktreePath);
  if (status.code !== 0) {
    throw new GitCommandError("git status failed", status.stderr);
  }
  return status.stdout.trim().length > 0;
}

export async function commitAllIfDirty(
  worktreePath: string,
  message: string,
): Promise<boolean> {
  const dirty = await hasChanges(worktreePath);
  if (!dirty) {
    return false;
  }

  const add = await git(["add", "-A"], worktreePath);
  if (add.code !== 0) {
    throw new GitCommandError("git add failed", add.stderr);
  }

  const commit = await git(["commit", "-m", message], worktreePath);
  if (commit.code !== 0) {
    throw new GitCommandError("git commit failed", commit.stderr);
  }
  return true;
}

export async function pushBranch(
  worktreePath: string,
  branch: string,
): Promise<void> {
  const push = await git(["push", "-u", "origin", branch], worktreePath);
  if (push.code !== 0) {
    throw new GitCommandError("git push failed", push.stderr);
  }
}

export async function removeWorktree(
  barePath: string,
  worktreePath: string,
): Promise<void> {
  if (!fs.existsSync(worktreePath)) {
    return;
  }
  await git(["worktree", "remove", "--force", worktreePath], barePath);
}
