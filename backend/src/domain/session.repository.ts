import type { Email } from './email';
import type { Registration } from './registration';
import type { Session } from './session';
import type { SessionSchedule } from './session-schedule';

/** An upcoming session as the list shows it, read without loading its registrations. */
export interface SessionListing {
  id: string;
  title: string;
  capacity: number;
  schedule: SessionSchedule;
  seatsTaken: number;
  viewerIsRegistered: boolean;
}

/**
 * Repository port: where Session aggregates are kept. The domain declares what
 * it needs and the repository layer implements it, so the rules never depend
 * on SQL. It's an abstract class rather than an interface so that it can
 * serve as the dependency-injection token.
 */
export abstract class SessionRepository {
  /** Runs `work` atomically, holding the write lock until it commits. */
  abstract transaction<T>(work: () => T): T;

  abstract add(session: Session): void;

  /** The session with all of its registrations, or undefined. */
  abstract findById(id: string): Session | undefined;

  abstract addRegistration(session: Session, registration: Registration): void;

  abstract removeRegistration(session: Session, email: Email): void;

  /** Sessions that haven't started at `now`, soonest first. `viewer` may be null. */
  abstract listUpcoming(now: Date, viewer: Email | null): SessionListing[];

  abstract deleteAll(): void;
}
