import { spawn } from "node:child_process";

export type GhExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export async function gh(args: string[], cwd: string): Promise<GhExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      cwd,
      env: process.env,
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
  if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
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
    throw new Error(`gh pr create failed: ${result.stderr}`);
  }

  return result.stdout.trim() || null;
}
