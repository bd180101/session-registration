import { DomainError } from '../domain/domain-error';
import {
  type NewSessionDetails,
  SessionFactory,
} from '../domain/session.factory';
import { Database } from '../repository/database';
import { SqliteSessionRepository } from '../repository/sqlite-session.repository';
import { Clock } from './clock';
import { SessionsService } from './sessions.service';

// The use cases over a real (in-memory) SQLite repository: each call loads the
// aggregate fresh, so these show that rules and results survive storage.

const OPENS = '2030-01-10T09:00:00.000Z';
const CLOSES = '2030-01-20T17:00:00.000Z';
const STARTS = '2030-01-25T18:00:00.000Z';
const DURING_WINDOW = '2030-01-15T12:00:00.000Z';
const ONE_DAY = 24 * 60 * 60 * 1000;

/** The instant `iso`, shifted by `ms` milliseconds. */
const at = (iso: string, ms = 0) => new Date(Date.parse(iso) + ms);

class FakeClock extends Clock {
  private current = at('2030-01-01T00:00:00.000Z');

  now(): Date {
    return this.current;
  }

  set(time: string | Date): void {
    this.current = new Date(time);
  }
}

/** 'OK' if `action` succeeds, otherwise the code of the DomainError it throws. */
function outcome(action: () => unknown): string {
  try {
    action();
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe('SessionsService (use cases over SQLite)', () => {
  let db: Database;
  let clock: FakeClock;
  let service: SessionsService;

  beforeEach(() => {
    db = new Database(':memory:');
    clock = new FakeClock();
    const factory = new SessionFactory();
    service = new SessionsService(
      new SqliteSessionRepository(db, factory),
      factory,
      clock,
    );
  });

  afterEach(() => db.close());

  function createSession(overrides: Partial<NewSessionDetails> = {}) {
    return service.create({
      title: 'Town hall',
      capacity: 2,
      registrationOpensAt: at(OPENS),
      registrationClosesAt: at(CLOSES),
      startsAt: at(STARTS),
      ...overrides,
    });
  }

  it('stores registrations: seats and who holds them survive a fresh read', () => {
    const session = createSession();
    clock.set(DURING_WINDOW);
    service.register(session.id, 'Ann@Example.org');

    expect(service.listUpcoming(' ann@example.org ')).toEqual([
      expect.objectContaining({
        id: session.id,
        seatsRemaining: 1,
        registrationStatus: 'open',
        isRegistered: true,
      }),
    ]);
    expect(service.listUpcoming('bob@example.org')[0].isRegistered).toBe(false);
    // A malformed email is a lookup that matches nothing, not an error.
    expect(service.listUpcoming('not-an-email')[0].isRegistered).toBe(false);
  });

  it('enforces capacity across separate requests', () => {
    const session = createSession({ capacity: 1 });
    clock.set(DURING_WINDOW);
    service.register(session.id, 'ann@example.org');

    expect(outcome(() => service.register(session.id, 'bob@example.org'))).toBe(
      'SESSION_FULL',
    );
  });

  it('frees the stored seat when someone unregisters', () => {
    const session = createSession({ capacity: 1 });
    clock.set(DURING_WINDOW);
    service.register(session.id, 'ann@example.org');

    service.unregister(session.id, 'ann@example.org');

    expect(outcome(() => service.register(session.id, 'bob@example.org'))).toBe(
      'OK',
    );
  });

  it('lists only sessions that have not started, soonest first', () => {
    createSession({ title: 'Later', startsAt: at(STARTS, ONE_DAY) });
    createSession({ title: 'Sooner' });
    clock.set(DURING_WINDOW);

    expect(service.listUpcoming().map((s) => s.title)).toEqual([
      'Sooner',
      'Later',
    ]);
    clock.set(at(STARTS));
    expect(service.listUpcoming().map((s) => s.title)).toEqual(['Later']);
  });

  it('reports a session that does not exist', () => {
    expect(
      outcome(() => service.register('no-such-id', 'ann@example.org')),
    ).toBe('SESSION_NOT_FOUND');
  });
});
