const SCRUBBED_KEYS = [
  "REMOTE_AGENT_TOKEN",
  "REMOTE_AGENT_APPLY_TOKEN",
  "CURSOR_API_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

export type AppSecrets = {
  remoteAgentToken: string;
  remoteAgentApplyToken?: string;
  cursorApiKey: string;
  githubToken?: string;
  modelId: string;
};

let secrets: AppSecrets | null = null;

export function initializeSecrets(): AppSecrets {
  if (secrets) {
    return secrets;
  }

  const remoteAgentToken = process.env.REMOTE_AGENT_TOKEN;
  if (!remoteAgentToken) {
    throw new Error("REMOTE_AGENT_TOKEN is required");
  }

  const cursorApiKey = process.env.CURSOR_API_KEY;
  if (!cursorApiKey) {
    throw new Error("CURSOR_API_KEY is required");
  }

  secrets = {
    remoteAgentToken,
    remoteAgentApplyToken: process.env.REMOTE_AGENT_APPLY_TOKEN,
    cursorApiKey,
    githubToken: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
    modelId: process.env.CURSOR_MODEL_ID ?? "claude-4-sonnet",
  };

  for (const key of SCRUBBED_KEYS) {
    delete process.env[key];
  }

  if (!secrets.remoteAgentApplyToken) {
    console.warn(
      "[security] REMOTE_AGENT_APPLY_TOKEN is not set — any bearer holder can create apply runs",
    );
  }

  return secrets;
}

export function getSecrets(): AppSecrets {
  if (!secrets) {
    throw new Error("Secrets not initialized; call initializeSecrets() at startup");
  }
  return secrets;
}

/** Test-only reset. */
export function __resetSecretsForTests(): void {
  secrets = null;
}
