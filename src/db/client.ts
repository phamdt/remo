import Database from "better-sqlite3";
import type { RunMode, RunRecord, RunRepoRow, RunStatus } from "../types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  run_path TEXT NOT NULL,
  cursor_state_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_repos (
  run_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  role TEXT NOT NULL,
  path TEXT NOT NULL,
  base_ref TEXT NOT NULL,
  branch TEXT,
  pr_url TEXT,
  PRIMARY KEY (run_id, repo_id),
  FOREIGN KEY (run_id) REFERENCES runs(id)
);
`;

export class RunDatabase {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  insertRun(record: RunRecord, repos: RunRepoRow[]): void {
    const insertRun = this.db.prepare(`
      INSERT INTO runs (id, workspace_id, status, mode, run_path, cursor_state_path, created_at, updated_at)
      VALUES (@id, @workspaceId, @status, @mode, @runPath, @cursorStatePath, @createdAt, @updatedAt)
    `);
    const insertRepo = this.db.prepare(`
      INSERT INTO run_repos (run_id, repo_id, role, path, base_ref, branch, pr_url)
      VALUES (@runId, @repoId, @role, @path, @baseRef, @branch, @prUrl)
    `);

    const tx = this.db.transaction(() => {
      insertRun.run({
        id: record.id,
        workspaceId: record.workspaceId,
        status: record.status,
        mode: record.mode,
        runPath: record.runPath,
        cursorStatePath: record.cursorStatePath,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
      for (const repo of repos) {
        insertRepo.run({
          runId: record.id,
          repoId: repo.repoId,
          role: repo.role,
          path: repo.path,
          baseRef: repo.baseRef,
          branch: repo.branch,
          prUrl: repo.prUrl,
        });
      }
    });
    tx();
  }

  getRun(id: string): RunRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, workspace_id AS workspaceId, status, mode, run_path AS runPath,
                cursor_state_path AS cursorStatePath, created_at AS createdAt, updated_at AS updatedAt
         FROM runs WHERE id = ?`,
      )
      .get(id) as RunRecord | undefined;
    return row ?? null;
  }

  listRunRepos(runId: string): RunRepoRow[] {
    return this.db
      .prepare(
        `SELECT repo_id AS repoId, role, path, base_ref AS baseRef, branch, pr_url AS prUrl
         FROM run_repos WHERE run_id = ?`,
      )
      .all(runId) as RunRepoRow[];
  }

  updateStatus(id: string, status: RunStatus, updatedAt: string): void {
    this.db
      .prepare(`UPDATE runs SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, updatedAt, id);
  }

  updateRunRepoBranch(
    runId: string,
    repoId: string,
    branch: string | null,
    prUrl: string | null,
  ): void {
    this.db
      .prepare(
        `UPDATE run_repos SET branch = ?, pr_url = ? WHERE run_id = ? AND repo_id = ?`,
      )
      .run(branch, prUrl, runId, repoId);
  }

  close(): void {
    this.db.close();
  }
}
