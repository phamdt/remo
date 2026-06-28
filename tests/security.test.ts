import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRunRequestSchema } from "../src/api-schema.js";
import { safeEqualToken } from "../src/middleware/auth.js";
import { runResultHandle } from "../src/paths.js";
import {
  clientErrorMessage,
  redactSecrets,
} from "../src/security/errors.js";
import { parseGitRef } from "../src/security/git-ref.js";
import {
  __resetSecretsForTests,
  initializeSecrets,
} from "../src/security/secrets.js";
import { buildGitEnv } from "../src/security/env.js";

describe("security", () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.REMOTE_AGENT_TOKEN = process.env.REMOTE_AGENT_TOKEN;
    envBackup.CURSOR_API_KEY = process.env.CURSOR_API_KEY;
    envBackup.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    process.env.REMOTE_AGENT_TOKEN = "read-token";
    process.env.CURSOR_API_KEY = "cursor-key";
    process.env.GITHUB_TOKEN = "ghp_testtoken12345678901234567890";
    __resetSecretsForTests();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    __resetSecretsForTests();
  });

  it("scrubs secrets from process.env after initializeSecrets", () => {
    initializeSecrets();
    expect(process.env.REMOTE_AGENT_TOKEN).toBeUndefined();
    expect(process.env.CURSOR_API_KEY).toBeUndefined();
    expect(process.env.GITHUB_TOKEN).toBeUndefined();
  });

  it("injects github token only into git env", () => {
    initializeSecrets();
    const gitEnv = buildGitEnv();
    expect(gitEnv.GITHUB_TOKEN).toBe("ghp_testtoken12345678901234567890");
    expect(process.env.GITHUB_TOKEN).toBeUndefined();
  });

  it("uses timing-safe token comparison", () => {
    expect(safeEqualToken("abc", "abc")).toBe(true);
    expect(safeEqualToken("abc", "abd")).toBe(false);
    expect(safeEqualToken("abc", "abcd")).toBe(false);
  });

  it("rejects invalid baseRef in create run schema", () => {
    const result = createRunRequestSchema.safeParse({
      workspaceId: "demo",
      mode: "plan_only",
      prompt: "hi",
      baseRef: "-malicious",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid baseRef", () => {
    expect(parseGitRef("main")).toBe("main");
    expect(parseGitRef("release/1.2")).toBe("release/1.2");
  });

  it("returns opaque result handle", () => {
    expect(runResultHandle("run_abc")).toBe("runs/run_abc/result");
  });

  it("redacts secrets from error messages", () => {
    const text = "failed with ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    expect(redactSecrets(text)).not.toContain("ghp_");
  });

  it("returns generic client error message", () => {
    const message = clientErrorMessage(
      new Error("git push failed: secret ghp_abcdefghijklmnopqrstuvwxyz1234567890"),
      "publish",
    );
    expect(message).toBe("An internal error occurred");
    expect(message).not.toContain("ghp_");
  });
});
