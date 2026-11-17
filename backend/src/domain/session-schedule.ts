import { DomainError } from './domain-error';

export type RegistrationStatus = 'not_open' | 'open' | 'closed';

export interface ScheduleTimes {
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  startsAt: Date;
}

/**
 * Value object: when registration opens and closes, and when the session
 * starts. It can only exist in a coherent state, so nothing else re-checks it.
 */
export class SessionSchedule implements ScheduleTimes {
  private constructor(
    readonly registrationOpensAt: Date,
    readonly registrationClosesAt: Date,
    readonly startsAt: Date,
  ) {}

  /** Throws INVALID_SESSION unless registration opens before it closes, no later than the start. */
  static of(times: ScheduleTimes): SessionSchedule {
    const opens = times.registrationOpensAt.getTime();
    const closes = times.registrationClosesAt.getTime();
    const starts = times.startsAt.getTime();
    if ([opens, closes, starts].some((time) => Number.isNaN(time))) {
      throw new DomainError('INVALID_SESSION', 'Every date must be valid.');
    }
    if (opens >= closes) {
      throw new DomainError(
        'INVALID_SESSION',
        'Registration must open before it closes.',
      );
    }
    if (closes > starts) {
      throw new DomainError(
        'INVALID_SESSION',
        'Registration must close no later than the session starts.',
      );
    }
    return new SessionSchedule(
      times.registrationOpensAt,
      times.registrationClosesAt,
      times.startsAt,
    );
  }

  /** The window includes the instant it opens and excludes the instant it closes. */
  registrationStatusAt(now: Date): RegistrationStatus {
    if (now.getTime() < this.registrationOpensAt.getTime()) return 'not_open';
    if (now.getTime() >= this.registrationClosesAt.getTime()) return 'closed';
    return 'open';
  }

  hasStartedAt(now: Date): boolean {
    return now.getTime() >= this.startsAt.getTime();
  }
}
