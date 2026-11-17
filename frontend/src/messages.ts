import { ApiError } from './api'

// The API's `code` is the stable contract; the wording shown to people lives here.
const MESSAGES: Record<string, string> = {
  SESSION_FULL: 'Sorry, this session is full.',
  REGISTRATION_CLOSED: 'Registration for this session has closed.',
  REGISTRATION_NOT_OPEN: "Registration for this session hasn't opened yet.",
  ALREADY_REGISTERED: "You're already registered for this session.",
  NOT_REGISTERED: "There's no registration for this email on this session.",
  SESSION_STARTED: 'This session has already started, so registrations can no longer change.',
  SESSION_NOT_FOUND: 'This session no longer exists.',
}

/** A message to show for a failed request. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  const known = error.code ? MESSAGES[error.code] : undefined
  if (known) return known
  if (error.status === 0 || error.status >= 500) {
    return "Can't reach the server right now. Is the backend running?"
  }
  return error.message
}
