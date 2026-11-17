import type { SessionSummary } from '../application/session-summary';
import type { Registration } from '../domain/registration';
import type { Session } from '../domain/session';
import type {
  RegistrationStatus,
  SessionSchedule,
} from '../domain/session-schedule';

// The HTTP contract. Domain objects never leave the API as they are: these are
// the shapes clients see, with dates as ISO 8601 strings.

export interface SessionResponse {
  id: string;
  title: string;
  capacity: number;
  startsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
}

export interface SessionSummaryResponse extends SessionResponse {
  seatsRemaining: number;
  registrationStatus: RegistrationStatus;
  isRegistered: boolean;
}

export interface RegistrationResponse {
  sessionId: string;
  email: string;
  registeredAt: string;
}

export function toSessionResponse(session: Session): SessionResponse {
  return {
    id: session.id,
    title: session.title,
    capacity: session.capacity,
    ...toScheduleFields(session.schedule),
  };
}

export function toSessionSummaryResponse(
  summary: SessionSummary,
): SessionSummaryResponse {
  return {
    id: summary.id,
    title: summary.title,
    capacity: summary.capacity,
    ...toScheduleFields(summary.schedule),
    seatsRemaining: summary.seatsRemaining,
    registrationStatus: summary.registrationStatus,
    isRegistered: summary.isRegistered,
  };
}

export function toRegistrationResponse(
  sessionId: string,
  registration: Registration,
): RegistrationResponse {
  return {
    sessionId,
    email: registration.email.value,
    registeredAt: registration.registeredAt.toISOString(),
  };
}

function toScheduleFields(schedule: SessionSchedule) {
  return {
    startsAt: schedule.startsAt.toISOString(),
    registrationOpensAt: schedule.registrationOpensAt.toISOString(),
    registrationClosesAt: schedule.registrationClosesAt.toISOString(),
  };
}
