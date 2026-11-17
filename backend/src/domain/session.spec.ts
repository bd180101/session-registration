import { DomainError } from './domain-error';
import { Email } from './email';
import { type NewSessionDetails, SessionFactory } from './session.factory';

// Pure domain tests: no Nest, no database, just the rules.

const OPENS = '2030-01-10T09:00:00.000Z';
const CLOSES = '2030-01-20T17:00:00.000Z';
const STARTS = '2030-01-25T18:00:00.000Z';
const BEFORE_ANYTHING = '2030-01-01T00:00:00.000Z';
const DURING_WINDOW = '2030-01-15T12:00:00.000Z';

/** The instant `iso`, shifted by `ms` milliseconds. */
const at = (iso: string, ms = 0) => new Date(Date.parse(iso) + ms);

const factory = new SessionFactory();
const ann = Email.parse('ann@example.org');
const bob = Email.parse('bob@example.org');

function details(
  overrides: Partial<NewSessionDetails> = {},
): NewSessionDetails {
  return {
    title: 'Town hall',
    capacity: 2,
    registrationOpensAt: at(OPENS),
    registrationClosesAt: at(CLOSES),
    startsAt: at(STARTS),
    ...overrides,
  };
}

const newSession = (overrides: Partial<NewSessionDetails> = {}) =>
  factory.create(details(overrides), at(BEFORE_ANYTHING));

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

describe('Session (aggregate)', () => {
  describe('register', () => {
    it.each([
      ['1 ms before it opens', at(OPENS, -1), 'REGISTRATION_NOT_OPEN'],
      ['the instant it opens', at(OPENS), 'OK'],
      ['1 ms before it closes', at(CLOSES, -1), 'OK'],
      ['the instant it closes', at(CLOSES), 'REGISTRATION_CLOSED'],
    ])('registering %s gives %s', (_, now, expected) => {
      expect(outcome(() => newSession().register(ann, now))).toBe(expected);
    });

    it('fills exactly to capacity, then rejects with SESSION_FULL', () => {
      const session = newSession({ capacity: 2 });
      session.register(ann, at(DURING_WINDOW));
      session.register(bob, at(DURING_WINDOW));

      const cat = Email.parse('cat@example.org');
      expect(outcome(() => session.register(cat, at(DURING_WINDOW)))).toBe(
        'SESSION_FULL',
      );
      expect(session.seatsRemaining).toBe(0);
    });

    it('treats one email typed differently as the same participant', () => {
      const session = newSession();
      session.register(Email.parse('Ann@Example.org'), at(DURING_WINDOW));

      const sameAnn = Email.parse('  ann@example.ORG ');
      expect(outcome(() => session.register(sameAnn, at(DURING_WINDOW)))).toBe(
        'ALREADY_REGISTERED',
      );
      expect(session.seatsRemaining).toBe(1);
    });

    it('tells a registered participant so, even once the session is full or closed', () => {
      const session = newSession({ capacity: 1 });
      session.register(ann, at(DURING_WINDOW));

      expect(outcome(() => session.register(ann, at(DURING_WINDOW)))).toBe(
        'ALREADY_REGISTERED',
      );
      expect(outcome(() => session.register(ann, at(CLOSES)))).toBe(
        'ALREADY_REGISTERED',
      );
    });
  });

  describe('unregister', () => {
    it('frees the seat for someone else', () => {
      const session = newSession({ capacity: 1 });
      session.register(ann, at(DURING_WINDOW));

      session.unregister(ann, at(DURING_WINDOW));

      expect(outcome(() => session.register(bob, at(DURING_WINDOW)))).toBe(
        'OK',
      );
    });

    it('is allowed after registration closes, but not once the session has started', () => {
      const session = newSession();
      session.register(ann, at(DURING_WINDOW));
      session.register(bob, at(DURING_WINDOW));

      expect(outcome(() => session.unregister(ann, at(CLOSES)))).toBe('OK');
      expect(outcome(() => session.unregister(bob, at(STARTS)))).toBe(
        'SESSION_STARTED',
      );
    });

    it('rejects an email that is not registered', () => {
      expect(
        outcome(() => newSession().unregister(ann, at(DURING_WINDOW))),
      ).toBe('NOT_REGISTERED');
    });
  });
});

describe('SessionFactory', () => {
  it.each([
    ['the title is blank', { title: '   ' }],
    ['capacity is below 1', { capacity: 0 }],
    ['a date is not a real date', { startsAt: new Date('not a date') }],
    [
      'registration opens after it closes',
      { registrationOpensAt: at(CLOSES, 1) },
    ],
    [
      'registration closes after the session starts',
      { registrationClosesAt: at(STARTS, 1) },
    ],
    [
      'the session has already started',
      {
        registrationOpensAt: at('2029-12-01T00:00:00.000Z'),
        registrationClosesAt: at('2029-12-10T00:00:00.000Z'),
        startsAt: at('2029-12-15T00:00:00.000Z'),
      },
    ],
  ])('refuses to create a session when %s', (_, overrides) => {
    expect(outcome(() => newSession(overrides))).toBe('INVALID_SESSION');
  });

  it('gives each new session its own id and a trimmed title', () => {
    const session = newSession({ title: '  Town hall ' });

    expect(session.title).toBe('Town hall');
    expect(session.id).not.toBe(newSession().id);
  });

  it('restores a stored session as it was, even one that has already started', () => {
    const restored = factory.restore({
      id: 's1',
      ...details({
        registrationOpensAt: at('2020-01-01T00:00:00.000Z'),
        registrationClosesAt: at('2020-01-02T00:00:00.000Z'),
        startsAt: at('2020-01-03T00:00:00.000Z'),
      }),
      registrations: [
        { email: ann, registeredAt: at('2020-01-01T12:00:00.000Z') },
      ],
    });

    expect(restored.isRegistered(ann)).toBe(true);
    expect(restored.seatsRemaining).toBe(1);
  });
});

describe('Email (value object)', () => {
  it('normalizes case and spacing, and rejects anything that is not an address', () => {
    expect(Email.parse('  Ann@Example.ORG ').value).toBe('ann@example.org');
    expect(outcome(() => Email.parse('not-an-email'))).toBe('INVALID_EMAIL');
    expect(Email.tryParse('not-an-email')).toBeNull();
  });
});
