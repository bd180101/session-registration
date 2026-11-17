import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Database } from '../src/repository/database';

const HOUR = 60 * 60 * 1000;

/** An ISO timestamp `ms` milliseconds from now. */
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('Sessions API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Database)
      .useValue(new Database(':memory:'))
      .compile();
    app = moduleRef.createNestApplication();
    // Listen on a real port so concurrent requests all reach one running server.
    await app.listen(0);
  });

  afterEach(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function createSession(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await api()
      .post('/api/sessions')
      .send({
        title: 'Town hall',
        capacity: 2,
        registrationOpensAt: fromNow(-HOUR),
        registrationClosesAt: fromNow(HOUR),
        startsAt: fromNow(2 * HOUR),
        ...overrides,
      })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  const register = (sessionId: string, email: string) =>
    api().post(`/api/sessions/${sessionId}/registrations`).send({ email });

  const unregister = (sessionId: string, email: string) =>
    api().delete(
      `/api/sessions/${sessionId}/registrations/${encodeURIComponent(email)}`,
    );

  async function expectRuleError(
    pending: ReturnType<typeof register>,
    status: number,
    code: string,
  ) {
    const { body } = await pending.expect(status);
    expect(body).toMatchObject({ statusCode: status, code });
  }

  it('creates a session and lists it with its times and the seats remaining', async () => {
    const times = {
      registrationOpensAt: fromNow(-HOUR),
      registrationClosesAt: fromNow(HOUR),
      startsAt: fromNow(2 * HOUR),
    };
    const id = await createSession({ capacity: 3, ...times });
    await register(id, 'ann@example.org').expect(201);

    const { body } = await api().get('/api/sessions').expect(200);

    // Exactly the fields the UI reads, with dates as ISO 8601 strings.
    expect(body).toEqual([
      {
        id,
        title: 'Town hall',
        capacity: 3,
        ...times,
        seatsRemaining: 2,
        registrationStatus: 'open',
        isRegistered: false,
      },
    ]);
  });

  it('tells a participant which sessions they are registered for', async () => {
    const id = await createSession();
    await register(id, 'ann@example.org').expect(201);

    const forAnn = await api()
      .get('/api/sessions')
      .query({ email: 'Ann@Example.org' })
      .expect(200);
    const forBob = await api()
      .get('/api/sessions')
      .query({ email: 'bob@example.org' })
      .expect(200);

    expect(forAnn.body[0].isRegistered).toBe(true);
    expect(forBob.body[0].isRegistered).toBe(false);
  });

  it('rejects malformed input with 400 and names the fields at fault', async () => {
    const { body } = await api()
      .post('/api/sessions')
      .send({ title: ' ', capacity: 0, startsAt: 'tomorrow' })
      .expect(400);

    expect(body.message).toEqual(
      expect.arrayContaining([
        'title: Title is required',
        'capacity: Capacity must be at least 1',
        'startsAt: Invalid ISO datetime',
      ]),
    );
    await register(await createSession(), 'not-an-email').expect(400);
  });

  it('answers each broken rule with a status and a code the UI can show', async () => {
    const id = await createSession({ capacity: 1 });
    await register(id, 'ann@example.org').expect(201);
    const closed = await createSession({
      registrationOpensAt: fromNow(-2 * HOUR),
      registrationClosesAt: fromNow(-HOUR),
    });
    const notOpenYet = await createSession({
      registrationOpensAt: fromNow(HOUR),
      registrationClosesAt: fromNow(2 * HOUR),
      startsAt: fromNow(3 * HOUR),
    });

    await expectRuleError(
      register(id, 'ANN@example.org'),
      409,
      'ALREADY_REGISTERED',
    );
    await expectRuleError(register(id, 'bob@example.org'), 409, 'SESSION_FULL');
    await expectRuleError(
      register(closed, 'bob@example.org'),
      409,
      'REGISTRATION_CLOSED',
    );
    await expectRuleError(
      register('no-such-id', 'bob@example.org'),
      404,
      'SESSION_NOT_FOUND',
    );
    await expectRuleError(
      unregister(id, 'bob@example.org'),
      404,
      'NOT_REGISTERED',
    );
    await expectRuleError(
      register(notOpenYet, 'bob@example.org'),
      409,
      'REGISTRATION_NOT_OPEN',
    );
    await expectRuleError(unregister(id, 'not-an-email'), 400, 'INVALID_EMAIL');
    // Well-formed, but registration would close after the session starts.
    await expectRuleError(
      api()
        .post('/api/sessions')
        .send({
          title: 'Clash',
          capacity: 5,
          registrationOpensAt: fromNow(HOUR),
          registrationClosesAt: fromNow(3 * HOUR),
          startsAt: fromNow(2 * HOUR),
        }),
      400,
      'INVALID_SESSION',
    );
  });

  it('frees the seat when someone unregisters', async () => {
    const id = await createSession({ capacity: 1 });
    await register(id, 'ann+news@example.org').expect(201);

    await unregister(id, 'ann+news@example.org').expect(204);

    await register(id, 'bob@example.org').expect(201);
  });

  it('never oversells when many people register at the same moment', async () => {
    const id = await createSession({ capacity: 5 });

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        register(id, `person${i}@example.org`),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(5);
    expect(statuses.filter((status) => status === 409)).toHaveLength(15);
    const { body } = await api().get('/api/sessions').expect(200);
    expect(body[0].seatsRemaining).toBe(0);
  });
});
