import { z } from "zod";

/** Safe git ref / branch name fragment (no shell metacharacters, no leading -). */
export const gitRefSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9/._-]+$/, "Invalid git ref")
  .refine((ref) => !ref.startsWith("-"), "Invalid git ref")
  .refine((ref) => !ref.includes(".."), "Invalid git ref")
  .refine((ref) => !ref.includes("//"), "Invalid git ref");

export function parseGitRef(value: string): string {
  return gitRefSchema.parse(value);
}
