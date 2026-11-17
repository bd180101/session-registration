import { Injectable } from '@nestjs/common';
import { Email } from '../domain/email';
import type { Registration } from '../domain/registration';
import type { Session } from '../domain/session';
import { SessionFactory } from '../domain/session.factory';
import type {
  SessionListing,
  SessionRepository,
} from '../domain/session.repository';
import { SessionSchedule } from '../domain/session-schedule';
import { Database } from './database';

type SessionRow = {
  id: string;
  title: string;
  starts_at: number;
  capacity: number;
  registration_opens_at: number;
  registration_closes_at: number;
};

type RegistrationRow = { email: string; registered_at: number };

type ListingRow = SessionRow & {
  seats_taken: number;
  viewer_is_registered: number;
};

/** The SQLite implementation of the domain's SessionRepository port. */
@Injectable()
export class SqliteSessionRepository implements SessionRepository {
  constructor(
    private readonly db: Database,
    private readonly factory: SessionFactory,
  ) {}

  transaction<T>(work: () => T): T {
    return this.db.transaction(work);
  }

  add(session: Session): void {
    const { schedule } = session;
    this.db
      .prepare(
        `INSERT INTO sessions (id, title, starts_at, capacity, registration_opens_at, registration_closes_at)
         VALUES (:id, :title, :startsAt, :capacity, :opensAt, :closesAt)`,
      )
      .run({
        id: session.id,
        title: session.title,
        startsAt: schedule.startsAt.getTime(),
        capacity: session.capacity,
        opensAt: schedule.registrationOpensAt.getTime(),
        closesAt: schedule.registrationClosesAt.getTime(),
      });
  }

  findById(id: string): Session | undefined {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = :id')
      .get({ id }) as SessionRow | undefined;
    if (!row) return undefined;

    const registrationRows = this.db
      .prepare(
        'SELECT email, registered_at FROM registrations WHERE session_id = :id ORDER BY registered_at, email',
      )
      .all({ id }) as RegistrationRow[];

    return this.factory.restore({
      id: row.id,
      title: row.title,
      capacity: row.capacity,
      ...toScheduleTimes(row),
      registrations: registrationRows.map((registration) => ({
        email: Email.parse(registration.email),
        registeredAt: new Date(registration.registered_at),
      })),
    });
  }

  addRegistration(session: Session, registration: Registration): void {
    this.db
      .prepare(
        'INSERT INTO registrations (session_id, email, registered_at) VALUES (:sessionId, :email, :registeredAt)',
      )
      .run({
        sessionId: session.id,
        email: registration.email.value,
        registeredAt: registration.registeredAt.getTime(),
      });
  }

  removeRegistration(session: Session, email: Email): void {
    this.db
      .prepare(
        'DELETE FROM registrations WHERE session_id = :sessionId AND email = :email',
      )
      .run({ sessionId: session.id, email: email.value });
  }

  listUpcoming(now: Date, viewer: Email | null): SessionListing[] {
    // Counts seats in SQL instead of loading every session's registrations.
    const rows = this.db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM registrations r WHERE r.session_id = s.id) AS seats_taken,
                EXISTS (SELECT 1 FROM registrations r
                        WHERE r.session_id = s.id AND r.email = :viewer) AS viewer_is_registered
         FROM sessions s
         WHERE s.starts_at > :now
         ORDER BY s.starts_at, s.title`,
      )
      .all({
        now: now.getTime(),
        viewer: viewer?.value ?? null,
      }) as ListingRow[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      capacity: row.capacity,
      schedule: SessionSchedule.of(toScheduleTimes(row)),
      seatsTaken: row.seats_taken,
      viewerIsRegistered: row.viewer_is_registered === 1,
    }));
  }

  deleteAll(): void {
    // Deleting a session cascades to its registrations.
    this.db.prepare('DELETE FROM sessions').run();
  }
}

function toScheduleTimes(row: SessionRow) {
  return {
    registrationOpensAt: new Date(row.registration_opens_at),
    registrationClosesAt: new Date(row.registration_closes_at),
    startsAt: new Date(row.starts_at),
  };
}
