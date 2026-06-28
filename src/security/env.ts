import { getSecrets } from "./secrets.js";

const SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "ComSpec",
  "WINDIR",
] as const;

function pickSafeBaseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

/** Minimal environment for git/gh subprocesses; injects GitHub token only here. */
export function buildGitEnv(): NodeJS.ProcessEnv {
  const env = pickSafeBaseEnv();
  const token = getSecrets().githubToken;
  if (token) {
    env.GITHUB_TOKEN = token;
    env.GH_TOKEN = token;
  }
  return env;
}

/** Environment without credentials — used before SDK agent sessions. */
export function buildAgentHostEnv(): NodeJS.ProcessEnv {
  return pickSafeBaseEnv();
}
