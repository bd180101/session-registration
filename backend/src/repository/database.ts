import { OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { SCHEMA } from './schema';

/** How long a connection waits for another process's write lock before failing. */
const BUSY_TIMEOUT_MS = 5000;

/**
 * One connection to SQLite through Node's built-in, synchronous driver.
 * Pass ':memory:' for a throwaway database, as the tests do.
 */
export class Database implements OnModuleDestroy {
  private readonly connection: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();

  constructor(filename: string) {
    if (filename !== ':memory:') {
      mkdirSync(dirname(filename), { recursive: true });
    }
    this.connection = new DatabaseSync(filename);
    // WAL: reads carry on while a write is in progress.
    // synchronous = FULL: a commit is on disk before it returns, so a
    //   registration the API confirmed survives a crash or power cut.
    // busy_timeout: a second process waits for the write lock instead of failing.
    this.connection.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};
    `);
    this.connection.exec(SCHEMA);
  }

  /** Returns a prepared statement, compiling each distinct SQL string once. */
  prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.connection.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  /**
   * Runs `work` atomically: its writes are committed together, or undone
   * together if it throws.
   *
   * The outermost call starts with BEGIN IMMEDIATE, which takes SQLite's write
   * lock before `work` reads anything. No other connection (such as a second
   * API process) can write until it commits, so checks made inside `work`
   * still hold when it writes. A nested call becomes a savepoint, so its
   * failure undoes only its own writes.
   *
   * `work` must be synchronous: code after an `await` would run outside the
   * transaction, where other requests could interleave with it.
   */
  transaction<T>(work: () => T): T {
    const nested = this.connection.isTransaction;
    this.connection.exec(nested ? 'SAVEPOINT nested' : 'BEGIN IMMEDIATE');
    try {
      const result = work();
      if (result instanceof Promise) {
        throw new TypeError('A transaction callback must be synchronous.');
      }
      this.connection.exec(nested ? 'RELEASE nested' : 'COMMIT');
      return result;
    } catch (error) {
      // After some severe errors SQLite has already rolled everything back.
      if (this.connection.isTransaction) {
        this.connection.exec(
          nested ? 'ROLLBACK TO nested; RELEASE nested' : 'ROLLBACK',
        );
      }
      throw error;
    }
  }

  close(): void {
    this.connection.close();
  }

  onModuleDestroy(): void {
    this.close();
  }
}
