# Session Registration

Participants register by email for time-boxed sessions. Each session has a fixed number of seats and a registration window. The API is NestJS, the UI is Vue 3, and the data lives in SQLite.

Take-home project 1: Session Registration with Capacity Limits.

## Run it

You need Node.js 22.18+ or 24.12+. Nothing else is required: no database server and no Docker, since the project uses SQLite.

```sh
# Terminal 1: the API, on http://localhost:3000
cd backend
npm install
npm run seed        # optional: resets the database to six demo sessions
npm run start:dev

# Terminal 2: the UI, on http://localhost:5173
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server forwards `/api` to the API, so the browser sees a single origin and no CORS setup is needed.

The database is one file, `backend/data/sessions.db`, created on first start. Set `DATABASE_PATH` to put it elsewhere, or delete the file to start over.

### Tests

```sh
cd backend
npm test           # domain rules, use cases over in-memory SQLite, and the database's ACID guarantees
npm run test:e2e   # the HTTP API, end to end
npm run lint
```

In `frontend/`, `npm run build` type-checks the UI and builds it.

### Seeing each error state in the UI

Run `npm run seed`, then type an email at the top of the page and press Enter. `attendee1@example.org` is already registered for three sessions.

- **Already registered:** register for an open session. The card shows "✓ You're registered" and greys out Register, and does so again whenever that email is entered.
- **Session full:** "Facilitator training" is full.
- **Registration closed:** "Town hall" has closed, and "Lunchtime listening circle" closes two minutes after seeding.
- **Not open yet:** "Book discussion" opens tomorrow.
- **Not registered:** Cancel is greyed out unless the email is registered.

The UI greys out actions it knows will fail. To see the API's own rejection, use two tabs and act in the second before it refreshes. For example, take the last seat in "Small-group dialogue" in one tab, then press Register in the other with a different email (session full) or the same email (already registered).

## API

Every route is under `/api`. Dates are ISO 8601 and must include a time zone: `Z` or an offset.

| Request                                     | Body                                                                       | Success                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /sessions?email=`                      |                                                                            | `200`: sessions that haven't started, soonest first. Each has `seatsRemaining`, `registrationStatus` (`not_open`, `open` or `closed`), and `isRegistered` for the optional `email` |
| `POST /sessions`                            | `{ title, capacity, startsAt, registrationOpensAt, registrationClosesAt }` | `201`: the session                                                                                                                                                                 |
| `POST /sessions/:id/registrations`          | `{ email }`                                                                | `201`: the registration                                                                                                                                                            |
| `DELETE /sessions/:id/registrations/:email` |                                                                            | `204`                                                                                                                                                                              |

Malformed input gets a `400` that lists every problem. A request that breaks a rule gets `{ statusCode, code, message }`:

| `code`                                                                                                  | Status |
| ------------------------------------------------------------------------------------------------------- | ------ |
| `INVALID_SESSION`, `INVALID_EMAIL`                                                                      | 400    |
| `SESSION_NOT_FOUND`, `NOT_REGISTERED`                                                                   | 404    |
| `ALREADY_REGISTERED`, `SESSION_FULL`, `REGISTRATION_NOT_OPEN`, `REGISTRATION_CLOSED`, `SESSION_STARTED` | 409    |

The UI picks its wording from `code` and falls back to the API's `message`.

## Architecture

The backend follows domain-driven design, in layers. Alongside the API, domain and repository layers, a thin application layer holds the use cases, because DDD keeps transactions out of the domain. Dependencies point inward: the API and repository layers depend on the domain, and the domain depends on nothing, with no Nest and no SQL.

| Layer       | Folder             | Responsibility                                                                                                                                                   |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API         | `src/api/`         | HTTP routes, request validation (Zod), response shapes, and mapping domain errors to status codes. Domain objects never leave this layer as they are.            |
| Application | `src/application/` | The use cases: create, list, register and unregister. Each loads an aggregate, lets it apply the rules, and saves the result in one transaction.                 |
| Domain      | `src/domain/`      | The business rules: the `Session` aggregate, the `Email` and `SessionSchedule` value objects, `SessionFactory`, domain errors, and the `SessionRepository` port. |
| Repository  | `src/repository/`  | Persistence: `SqliteSessionRepository` implements the domain's port, on top of the SQLite connection, transactions and schema.                                   |

- **Aggregate.** `Session` is the aggregate root and holds its registrations. The capacity and duplicate rules span all of a session's registrations, so one method, `session.register()`, enforces them.
- **Value objects.** `Email` normalizes and validates an address once, so the rest of the code can't compare raw strings by mistake. `SessionSchedule` can't be built in an impossible order, so nothing else re-checks it.
- **Factory.** `SessionFactory.create()` is the one place new sessions come into being: it applies the rules for a new session and assigns its id. `restore()` rebuilds a stored session without re-applying "must start in the future", which a stored session may no longer meet.
- **Repository port.** The domain declares `SessionRepository`, and `app.module.ts` binds it to `SqliteSessionRepository`. Moving to Postgres means writing another implementation, without touching the rules.
- **Reads.** The upcoming list is a separate query that counts seats in SQL, rather than loading every session's registrations.

## How the rules are enforced (ACID)

Each rule is enforced twice. The `Session` aggregate in the domain layer checks it first, so it can return a precise error code. The database enforces it again as a constraint, so it holds for any code that writes, not just the application.

- **Atomicity.** Every operation that checks and then writes runs in one transaction: registering, cancelling, and the seed's reset. If any step throws, nothing is written. A transaction started inside another becomes a savepoint, so its failure undoes only its own writes.
- **Consistency.** The schema refuses data that breaks a rule:
  - The primary key `(session_id, email)` blocks a second registration for the same email.
  - A CHECK keeps stored emails trimmed and lowercase, so capitals can't get around the key.
  - A trigger refuses any registration beyond a session's capacity.
  - CHECKs reject a capacity below 1 or an impossible schedule. A foreign key ties each registration to a session, and STRICT tables reject values of the wrong type.
- **Isolation.** Each transaction starts with `BEGIN IMMEDIATE`, which takes SQLite's write lock before its first read. So nothing can write between counting the seats and taking one, not even a second API process on the same file.
  - Within one process, Node's SQLite driver is synchronous, so requests can't interleave inside a transaction either. An `async` callback is refused, because its awaited part would run outside the transaction.
  - The e2e suite sends 20 simultaneous registrations to a 5-seat session and checks that exactly 5 succeed.
- **Durability.** The database runs in WAL mode with `synchronous = FULL`: each commit is written to disk before the API responds, so a confirmed registration survives a crash or power cut.

The registration window is checked inside the same transaction, against an injected clock, so tests can pin time to the millisecond.

## Persistence: SQLite

I used SQLite through Node's built-in `node:sqlite` module:

- **It fits the problem.** The core of the problem is two integrity rules, and a relational database can enforce both itself, as described above.
- **It's embedded.** The database is a file opened by the API process: no server, no container, nothing to install or compile. That's why the repo has no Docker Compose file, and why the tests can use real in-memory SQLite instead of a mock.

The trade-off is one writer at a time, on one machine. That's ample for this workload, but it doesn't scale out across several API servers (see [With another day](#with-another-day)).

I ruled out the other two options:

- **In-memory storage** loses everything on restart and sidesteps the concurrency question.
- **MongoDB's** natural design embeds registrations in the session document. A unique index can't stop duplicates inside one document's array, so "no double registration" would rest on application code alone.

## Assumptions

- **Window boundaries:** registration opens exactly at `registrationOpensAt` and closes exactly at `registrationClosesAt`. A request at the closing instant is too late.
- **Valid sessions:** a session must start in the future, and registration must open before it closes and close no later than the start. Capacity is 1 to 10,000, and the title is 1 to 200 characters.
- **"Upcoming"** means the session hasn't started. Sessions whose registration has closed still appear, marked closed, until they start.
- **Identity:** a participant is their email address, compared after trimming and lowercasing. The UI doesn't remember the email, so each page load starts fresh.
- **"Already registered" comes first.** A registered person who tries again is told they're registered, even if the session has since filled or closed. That's more useful than "full" or "closed".
- **Unregistering** is allowed until the session starts, including after registration closes, and frees the seat. Cancelling an email that isn't registered returns 404, not a silent success.
- **Times** are stored as milliseconds since the epoch, and the UI shows them in the viewer's own time zone.
- **Creating sessions:** the brief only asks for an API, but the UI has a small "Create a session" form for convenience.

## What I cut, and why

- **Sign-in and an organizer role.** The brief identifies participants by email only. Without sign-in, anyone who knows an email can see, make or cancel its registrations, and anyone can create sessions. It's the biggest gap before real use.
- **Email verification,** for the same reason.
- **A waitlist** for full sessions. It isn't in the brief.
- **Editing and deleting sessions.** These aren't in the brief. Lowering capacity below the current number of registrations would also need a policy.
- **Frontend tests.** The brief asks for tests of the capacity and window rules, which live in the API, so I spent the testing time there.
- **Live seat updates.** The UI refreshes every 15 seconds and after every action instead. The server is the source of truth either way.

## With another day

- **Sign-in,** so people can only change their own registrations. It would also take the email out of URLs (the list's `?email=` and the DELETE path), where today it can end up in access logs.
- **A waitlist** that promotes the next person when someone cancels.
- **Postgres,** to run several API servers. The registration logic needs one change there: under Postgres's default isolation level (READ COMMITTED), counting and then inserting _would_ oversell. I'd either lock the session row with `SELECT … FOR UPDATE`, or keep a seat counter updated with `UPDATE … WHERE registered < capacity`.
- **Handling 100x traffic.** The hot spot is a popular session the moment registration opens, because every request queues for the same lock. I'd:
  - cache `GET /sessions` for a few seconds
  - reject obviously-full sessions before they reach the database, with the database still the final authority
  - rate-limit registration
  - when registering, load a session's seat count instead of its whole registration list, which grows with capacity
- **More tests and tooling:**
  - component tests for the UI's error states (Vitest and Vue Test Utils)
  - a browser test (Playwright)
  - continuous integration running lint, type-checks and tests
- **Packaging and schema changes:**
  - a Dockerfile and Compose file that start the API and UI with one command
  - schema migrations to replace today's `CREATE TABLE IF NOT EXISTS` at startup

## How I Used AI Tools

I used AI tools as development assistants to improve efficiency, support code reviews, and validate implementation details while maintaining full ownership of the project's design, technical decisions, and implementation.

**Architecture and Design:** I independently evaluated the project options, selected SQLite for persistence, defined the business rules and assumptions, and designed the backend architecture using domain-driven layers and a session factory. AI was used as a sounding board to explore alternatives and review potential trade-offs.

**Implementation and Development:** I designed and implemented the application functionality, including session management, registration workflows, email-based participant identification, and frontend interactions. I used AI selectively for repetitive coding tasks, exploring alternative implementations, and identifying opportunities to improve code clarity and maintainability.

**Testing and User Experience:** I manually tested the application from a participant's perspective, identified usability gaps, and refined the experience to ensure accurate registration status, appropriate action availability, and consistent behavior across page reloads. AI assisted in suggesting additional edge cases and test scenarios, which I independently evaluated.

**Code Quality and Database Reliability:** I reviewed the implementation for maintainability, data integrity, and transaction safety. This included enforcing capacity and email uniqueness through database constraints and ensuring atomic cancellation and seeding operations. AI served as an additional review mechanism to help identify potential improvements.

**Verification and Validation:** I verified framework-specific behavior against the installed NestJS 12 APIs and validated the implementation through automated tests, linting, type-checking, and production builds. AI-generated suggestions were reviewed and accepted only when they aligned with the application's requirements and passed verification.

Overall, AI was a supporting tool throughout development, not a substitute for engineering judgment. I retained responsibility for the architecture, implementation, testing, technical trade-offs, and final code quality.

## Project layout

```
backend/                                  NestJS API
  src/{api,application,domain,repository}/  the four layers (see Architecture)
  src/app.module.ts                       composition root that wires the layers together
  src/seed.ts                             demo data
  test/                                   HTTP API tests
frontend/                                 Vue 3 + Vite UI
  src/api.ts                              typed API client
  src/messages.ts                         error code to message
  src/components/                         session card and create-session form
```
