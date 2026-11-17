import { DomainError } from './domain-error';

const MAX_LENGTH = 254;
const SHAPE = /^[^\s@]+@[^\s@]+$/;

/**
 * Value object: a participant's email address, normalized (trimmed and
 * lowercased) so one person always gets the same Email however they type it.
 */
export class Email {
  private constructor(readonly value: string) {}

  /** Throws INVALID_EMAIL if `raw` isn't an email address. */
  static parse(raw: string): Email {
    const email = Email.tryParse(raw);
    if (!email) {
      throw new DomainError(
        'INVALID_EMAIL',
        'This is not a valid email address.',
      );
    }
    return email;
  }

  /** Returns null instead of throwing, for lookups where a bad email matches nothing. */
  static tryParse(raw: string): Email | null {
    const value = raw.trim().toLowerCase();
    return value.length <= MAX_LENGTH && SHAPE.test(value)
      ? new Email(value)
      : null;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
