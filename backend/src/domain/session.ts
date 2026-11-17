import { DomainError } from './domain-error';
import type { Email } from './email';
import type { Registration } from './registration';
import type { SessionSchedule } from './session-schedule';

/**
 * Aggregate root: a session together with its registrations. The capacity and
 * duplicate rules span every registration, so they are enforced here, in one
 * place. Build sessions with SessionFactory rather than this constructor.
 */
export class Session {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly capacity: number,
    readonly schedule: SessionSchedule,
    private readonly registrations: Registration[],
  ) {}

  get seatsRemaining(): number {
    return this.capacity - this.registrations.length;
  }

  isRegistered(email: Email): boolean {
    return this.registrations.some((registration) =>
      registration.email.equals(email),
    );
  }

  /** Takes a seat for `email`, or throws the rule that prevents it. */
  register(email: Email, now: Date): Registration {
    // Checked first, so someone already registered is told that rather than
    // being alarmed by "closed" or "full".
    if (this.isRegistered(email)) {
      throw new DomainError(
        'ALREADY_REGISTERED',
        'This email is already registered for this session.',
      );
    }
    const status = this.schedule.registrationStatusAt(now);
    if (status === 'not_open') {
      throw new DomainError(
        'REGISTRATION_NOT_OPEN',
        'Registration for this session has not opened yet.',
      );
    }
    if (status === 'closed') {
      throw new DomainError(
        'REGISTRATION_CLOSED',
        'Registration for this session has closed.',
      );
    }
    if (this.seatsRemaining <= 0) {
      throw new DomainError('SESSION_FULL', 'This session is full.');
    }

    const registration: Registration = { email, registeredAt: now };
    this.registrations.push(registration);
    return registration;
  }

  /** Gives up `email`'s seat. Allowed until the session starts. */
  unregister(email: Email, now: Date): void {
    if (this.schedule.hasStartedAt(now)) {
      throw new DomainError(
        'SESSION_STARTED',
        'This session has already started.',
      );
    }
    const index = this.registrations.findIndex((registration) =>
      registration.email.equals(email),
    );
    if (index === -1) {
      throw new DomainError(
        'NOT_REGISTERED',
        'This email is not registered for this session.',
      );
    }
    this.registrations.splice(index, 1);
  }
}
