import { redactSecrets } from "./errors.js";

const MAX_LOG_LENGTH = 8_192;

export function sanitizeLogMessage(text: string): string {
  const redacted = redactSecrets(text);
  if (redacted.length <= MAX_LOG_LENGTH) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_LOG_LENGTH)}…`;
}
