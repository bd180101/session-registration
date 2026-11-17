// The database enforces every rule it can express, so no code path (a script,
// a future admin tool, a bug) can store data that breaks them. Times are Unix
// epoch milliseconds, so the window rules are plain numeric comparisons. STRICT
// tables reject values of the wrong type instead of silently coercing them.
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id                     TEXT    NOT NULL PRIMARY KEY,
    title                  TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    starts_at              INTEGER NOT NULL,
    capacity               INTEGER NOT NULL CHECK (capacity > 0),
    registration_opens_at  INTEGER NOT NULL,
    registration_closes_at INTEGER NOT NULL,
    CHECK (registration_opens_at < registration_closes_at),
    CHECK (registration_closes_at <= starts_at)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS sessions_by_start ON sessions (starts_at);

  -- The primary key makes a second registration with the same email impossible,
  -- and the CHECK keeps stored emails normalized so capitals can't sidestep it.
  CREATE TABLE IF NOT EXISTS registrations (
    session_id    TEXT    NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    email         TEXT    NOT NULL CHECK (email = lower(trim(email))),
    registered_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, email)
  ) STRICT;

  -- A session never exceeds its capacity, whatever code inserts the row. The
  -- service checks first to return a clear SESSION_FULL; this is the guarantee.
  CREATE TRIGGER IF NOT EXISTS registrations_within_capacity
  BEFORE INSERT ON registrations
  WHEN (SELECT COUNT(*) FROM registrations WHERE session_id = NEW.session_id)
       >= (SELECT capacity FROM sessions WHERE id = NEW.session_id)
  BEGIN
    SELECT RAISE(ABORT, 'session is full');
  END;
`;
