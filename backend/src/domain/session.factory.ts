import { randomUUID } from 'node:crypto';
import { DomainError } from './domain-error';
import type { Registration } from './registration';
import { Session } from './session';
import { type ScheduleTimes, SessionSchedule } from './session-schedule';

export interface NewSessionDetails extends ScheduleTimes {
  title: string;
  capacity: number;
}

/** A session as it was stored, for `restore` to rebuild. */
export interface StoredSession extends NewSessionDetails {
  id: string;
  registrations: Registration[];
}

/**
 * Factory for the Session aggregate, the one place sessions come into being.
 * `create` applies the rules for a brand-new session and gives it an id.
 * `restore` rebuilds a stored one, which may have started since, so the
 * "must start in the future" rule doesn't apply to it.
 */
export class SessionFactory {
  create(details: NewSessionDetails, now: Date): Session {
    const title = details.title.trim();
    if (!title) {
      throw new DomainError('INVALID_SESSION', 'Title is required.');
    }
    if (!Number.isInteger(details.capacity) || details.capacity < 1) {
      throw new DomainError(
        'INVALID_SESSION',
        'Capacity must be a whole number of at least 1.',
      );
    }
    const schedule = SessionSchedule.of(details);
    if (schedule.hasStartedAt(now)) {
      throw new DomainError(
        'INVALID_SESSION',
        'The session must start in the future.',
      );
    }
    return new Session(randomUUID(), title, details.capacity, schedule, []);
  }

  restore(stored: StoredSession): Session {
    return new Session(
      stored.id,
      stored.title,
      stored.capacity,
      SessionSchedule.of(stored),
      [...stored.registrations],
    );
  }
}
