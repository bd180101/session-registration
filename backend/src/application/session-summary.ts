import type {
  RegistrationStatus,
  SessionSchedule,
} from '../domain/session-schedule';

/** One row of the upcoming-sessions list, as the use case returns it. */
export interface SessionSummary {
  id: string;
  title: string;
  capacity: number;
  schedule: SessionSchedule;
  seatsRemaining: number;
  registrationStatus: RegistrationStatus;
  isRegistered: boolean;
}
