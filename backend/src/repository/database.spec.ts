import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from './database';

/** Adds session 's1' with room for two, its registration window open at t=1500. */
function addSession(db: Database): void {
  db.prepare(
    `INSERT INTO sessions (id, title, starts_at, capacity, registration_opens_at, registration_closes_at)
     VALUES ('s1', 'Town hall', 3000, 2, 1000, 2000)`,
  ).run();
}

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    addSession(db);
  });

  afterEach(() => db.close());

  // Raw inserts, bypassing the service, to show what the database itself allows.
  const insertRegistration = (email: string) =>
    db
      .prepare(
        "INSERT INTO registrations (session_id, email, registered_at) VALUES ('s1', :email, 1500)",
      )
      .run({ email });

  const storedEmails = () =>
    (
      db.prepare('SELECT email FROM registrations ORDER BY email').all() as {
        email: string;
      }[]
    ).map((row) => row.email);

  describe('transactions', () => {
    it('undoes every write when the work throws', () => {
      expect(() =>
        db.transaction(() => {
          insertRegistration('ann@example.org');
          throw new Error('failed halfway');
        }),
      ).toThrow('failed halfway');

      expect(storedEmails()).toEqual([]);
    });

    it('undoes only the failed part of a nested transaction', () => {
      db.transaction(() => {
        insertRegistration('ann@example.org');
        expect(() =>
          db.transaction(() => {
            insertRegistration('bob@example.org');
            throw new Error('inner step failed');
          }),
        ).toThrow('inner step failed');
      });

      expect(storedEmails()).toEqual(['ann@example.org']);
    });

    it('refuses async work, whose awaited part would escape the transaction', () => {
      expect(() =>
        db.transaction(async () => insertRegistration('ann@example.org')),
      ).toThrow(TypeError);

      expect(storedEmails()).toEqual([]);
    });
  });

  describe('constraints', () => {
    it('never lets a session exceed its capacity, even when the service is bypassed', () => {
      insertRegistration('ann@example.org');
      insertRegistration('bob@example.org');

      expect(() => insertRegistration('cat@example.org')).toThrow(
        'session is full',
      );
      expect(storedEmails()).toEqual(['ann@example.org', 'bob@example.org']);
    });

    it('refuses a second registration for an email, and emails that are not normalized', () => {
      insertRegistration('ann@example.org');

      expect(() => insertRegistration('ann@example.org')).toThrow(
        /UNIQUE constraint failed/,
      );
      expect(() => insertRegistration('Ann@Example.org')).toThrow(
        /CHECK constraint failed/,
      );
    });

    it('ties every registration to an existing session, and deletes them with it', () => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO registrations (session_id, email, registered_at) VALUES ('no-such-session', 'ann@example.org', 1500)",
          )
          .run(),
      ).toThrow(/FOREIGN KEY constraint failed/);

      insertRegistration('ann@example.org');
      db.prepare('DELETE FROM sessions').run(); // what the seed's reset relies on

      expect(storedEmails()).toEqual([]);
    });
  });

  it('commits to disk, so data survives closing and reopening the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sessions-db-'));
    try {
      const file = join(dir, 'sessions.db');
      const first = new Database(file);
      const { synchronous } = first.prepare('PRAGMA synchronous').get() as {
        synchronous: number;
      };
      addSession(first);
      first.close();

      const reopened = new Database(file);
      const { count } = reopened
        .prepare('SELECT COUNT(*) AS count FROM sessions')
        .get() as { count: number };
      reopened.close();

      expect(synchronous).toBe(2); // FULL
      expect(count).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
