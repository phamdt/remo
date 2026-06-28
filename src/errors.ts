export class ApplyTokenRequiredError extends Error {
  readonly code = "APPLY_TOKEN_REQUIRED" as const;

  constructor() {
    super("Apply mode requires REMOTE_AGENT_APPLY_TOKEN");
    this.name = "ApplyTokenRequiredError";
  }
}

export class TooManyConcurrentRunsError extends Error {
  readonly code = "TOO_MANY_CONCURRENT_RUNS" as const;

  constructor() {
    super("Too many concurrent runs");
    this.name = "TooManyConcurrentRunsError";
  }
}

export class RunNotFoundError extends Error {
  readonly code = "RUN_NOT_FOUND" as const;

  constructor(id: string) {
    super(`Run not found: ${id}`);
    this.name = "RunNotFoundError";
  }
}

export class RunNotActiveError extends Error {
  readonly code = "RUN_NOT_ACTIVE" as const;

  constructor() {
    super("Run is not active");
    this.name = "RunNotActiveError";
  }
}

export class RunAlreadyActiveError extends Error {
  readonly code = "RUN_ALREADY_ACTIVE" as const;

  constructor() {
    super("Run is already active");
    this.name = "RunAlreadyActiveError";
  }
}

export function httpStatusForError(error: unknown): 400 | 403 | 404 {
  if (error instanceof ApplyTokenRequiredError) {
    return 403;
  }
  if (error instanceof RunNotFoundError) {
    return 404;
  }
  return 400;
}
