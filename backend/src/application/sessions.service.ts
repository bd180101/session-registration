import { Injectable } from '@nestjs/common';
import { DomainError } from '../domain/domain-error';
import { Email } from '../domain/email';
import type { Registration } from '../domain/registration';
import type { Session } from '../domain/session';
import {
  type NewSessionDetails,
  SessionFactory,
} from '../domain/session.factory';
import {
  type SessionListing,
  SessionRepository,
} from '../domain/session.repository';
import { Clock } from './clock';
import type { SessionSummary } from './session-summary';

/**
 * The use cases. Each one loads the aggregate, lets it apply the rules, and
 * saves the result inside one transaction, so the rules still hold at commit.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly factory: SessionFactory,
    private readonly clock: Clock,
  ) {}

  create(details: NewSessionDetails): Session {
    const session = this.factory.create(details, this.clock.now());
    this.sessions.add(session);
    return session;
  }

  /** Upcoming sessions; `isRegistered` says whether `email`, if given, has a seat. */
  listUpcoming(email?: string): SessionSummary[] {
    const now = this.clock.now();
    const viewer = email ? Email.tryParse(email) : null;
    return this.sessions
      .listUpcoming(now, viewer)
      .map((listing) => toSummary(listing, now));
  }

  register(sessionId: string, email: string): Registration {
    const participant = Email.parse(email);
    const now = this.clock.now();
    return this.sessions.transaction(() => {
      const session = this.load(sessionId);
      const registration = session.register(participant, now);
      this.sessions.addRegistration(session, registration);
      return registration;
    });
  }

  unregister(sessionId: string, email: string): void {
    const participant = Email.parse(email);
    const now = this.clock.now();
    this.sessions.transaction(() => {
      const session = this.load(sessionId);
      session.unregister(participant, now);
      this.sessions.removeRegistration(session, participant);
    });
  }

  private load(id: string): Session {
    const session = this.sessions.findById(id);
    if (!session) {
      throw new DomainError('SESSION_NOT_FOUND', 'Session not found.');
    }
    return session;
  }
}

function toSummary(listing: SessionListing, now: Date): SessionSummary {
  return {
    id: listing.id,
    title: listing.title,
    capacity: listing.capacity,
    schedule: listing.schedule,
    seatsRemaining: listing.capacity - listing.seatsTaken,
    registrationStatus: listing.schedule.registrationStatusAt(now),
    isRegistered: listing.viewerIsRegistered,
  };
}
