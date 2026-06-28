import { spawn } from "node:child_process";
import { buildGitEnv } from "../security/env.js";
import { getSecrets } from "../security/secrets.js";

export type GhExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export class GhCommandError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GhCommandError";
  }
}

export async function gh(args: string[], cwd: string): Promise<GhExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
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

export async function createPullRequest(options: {
  cwd: string;
  branch: string;
  base: string;
  title: string;
  body: string;
}): Promise<string | null> {
  if (!getSecrets().githubToken) {
    return null;
  }

  const result = await gh(
    [
      "pr",
      "create",
      "--head",
      options.branch,
      "--base",
      options.base,
      "--title",
      options.title,
      "--body",
      options.body,
    ],
    options.cwd,
  );

  if (result.code !== 0) {
    throw new GhCommandError("gh pr create failed", result.stderr);
  }

  return result.stdout.trim() || null;
}
