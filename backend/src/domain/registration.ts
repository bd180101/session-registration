import type { Email } from './email';

/** Value object: one participant's seat in a session. */
export interface Registration {
  readonly email: Email;
  readonly registeredAt: Date;
}
