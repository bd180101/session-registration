export type RegistrationStatus = 'not_open' | 'open' | 'closed'

/** A session as the API lists it. Dates are ISO 8601 strings. */
export interface SessionSummary {
  id: string
  title: string
  startsAt: string
  capacity: number
  registrationOpensAt: string
  registrationClosesAt: string
  seatsRemaining: number
  registrationStatus: RegistrationStatus
  /** Whether the email the list was fetched for is registered for this session. */
  isRegistered: boolean
}

export interface NewSession {
  title: string
  capacity: number
  startsAt: string
  registrationOpensAt: string
  registrationClosesAt: string
}

/** A failed request. `code` is set when the API rejected it under a rule, e.g. SESSION_FULL. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, code: string | undefined, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    throw new ApiError(0, undefined, 'Could not reach the server.')
  }
  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    // Validation errors list every problem; rule errors carry one message.
    const message = Array.isArray(body.message) ? body.message.join('\n') : body.message
    throw new ApiError(response.status, body.code, message ?? response.statusText)
  }
  return body as T
}

export const api = {
  /** Upcoming sessions; with an email, each says whether that email is registered. */
  listSessions: (email = '') =>
    request<SessionSummary[]>(
      email ? `/sessions?email=${encodeURIComponent(email)}` : '/sessions',
    ),

  createSession: (session: NewSession) =>
    request<{ id: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    }),

  register: (sessionId: string, email: string) =>
    request<void>(`/sessions/${encodeURIComponent(sessionId)}/registrations`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  unregister: (sessionId: string, email: string) =>
    request<void>(
      `/sessions/${encodeURIComponent(sessionId)}/registrations/${encodeURIComponent(email)}`,
      { method: 'DELETE' },
    ),
}
