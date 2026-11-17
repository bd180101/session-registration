import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SessionsService } from './application/sessions.service';
import { SessionRepository } from './domain/session.repository';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Replaces everything in the local database with sessions in each state the
 * UI can show: open, one seat left, full, closing soon, closed, not yet open.
 */
async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const repository = app.get(SessionRepository);
  const sessions = app.get(SessionsService);
  const now = Date.now();
  const at = (offset: number) => new Date(now + offset);
  const openWindow = {
    registrationOpensAt: at(-DAY),
    registrationClosesAt: at(3 * DAY),
    startsAt: at(4 * DAY),
  };
  const fill = (sessionId: string, count: number) => {
    for (let i = 1; i <= count; i++) {
      sessions.register(sessionId, `attendee${i}@example.org`);
    }
  };

  // One transaction, so a failure leaves the previous data untouched rather
  // than a half-seeded database.
  repository.transaction(() => {
    repository.deleteAll();
    fill(
      sessions.create({
        title: 'Community conversation',
        capacity: 20,
        ...openWindow,
      }).id,
      5,
    );
    fill(
      sessions.create({
        title: 'Small-group dialogue',
        capacity: 3,
        ...openWindow,
      }).id,
      2,
    );
    fill(
      sessions.create({
        title: 'Facilitator training',
        capacity: 2,
        ...openWindow,
      }).id,
      2,
    );
    sessions.create({
      title: 'Lunchtime listening circle',
      capacity: 10,
      registrationOpensAt: at(-HOUR),
      registrationClosesAt: at(2 * MINUTE),
      startsAt: at(DAY),
    });
    sessions.create({
      title: 'Town hall',
      capacity: 50,
      registrationOpensAt: at(-3 * DAY),
      registrationClosesAt: at(-HOUR),
      startsAt: at(DAY),
    });
    sessions.create({
      title: 'Book discussion',
      capacity: 12,
      registrationOpensAt: at(DAY),
      registrationClosesAt: at(5 * DAY),
      startsAt: at(6 * DAY),
    });
  });

  await app.close();
  console.log(`Seeded 6 sessions:
  Community conversation       open, 15 of 20 seats left
  Small-group dialogue         open, 1 seat left
  Facilitator training         full
  Lunchtime listening circle   registration closes 2 minutes from now
  Town hall                    registration closed
  Book discussion              registration opens tomorrow`);
}

void seed();
