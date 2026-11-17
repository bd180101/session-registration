export type DomainErrorCode =
  | 'INVALID_SESSION'
  | 'INVALID_EMAIL'
  | 'SESSION_NOT_FOUND'
  | 'ALREADY_REGISTERED'
  | 'REGISTRATION_NOT_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'SESSION_FULL'
  | 'NOT_REGISTERED'
  | 'SESSION_STARTED';

/**
 * A request that breaks a business rule. `code` is stable, so the API layer
 * can map it to an HTTP status and the UI can map it to a message.
 */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
