const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{20,}/g,
  /github_pat_[a-zA-Z0-9_]{20,}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+\S+/gi,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export function logServerError(context: string, error: unknown): void {
  const message =
    error instanceof Error
      ? redactSecrets(error.message)
      : redactSecrets(String(error));
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${context}] ${message}`);
  if (stack) {
    console.error(redactSecrets(stack));
  }
}

export function clientErrorMessage(error: unknown, context: string): string {
  logServerError(context, error);
  return "An internal error occurred";
}

export function clientAgentErrorMessage(error: unknown): string {
  logServerError("agent", error);
  if (error instanceof Error && error.message === "cancelled") {
    return "cancelled";
  }
  return "Agent run failed";
}
