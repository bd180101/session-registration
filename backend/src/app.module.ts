import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { DomainErrorFilter } from './api/domain-error.filter';
import { SessionsController } from './api/sessions.controller';
import { Clock } from './application/clock';
import { SessionsService } from './application/sessions.service';
import { SessionFactory } from './domain/session.factory';
import { SessionRepository } from './domain/session.repository';
import { Database } from './repository/database';
import { SqliteSessionRepository } from './repository/sqlite-session.repository';

const DEFAULT_DATABASE_PATH = 'data/sessions.db';

/**
 * The composition root, where the layers are wired together. This is the only
 * place that knows the domain's SessionRepository port is backed by SQLite.
 */
@Module({
  controllers: [SessionsController],
  providers: [
    SessionsService,
    SessionFactory,
    Clock,
    { provide: SessionRepository, useClass: SqliteSessionRepository },
    {
      provide: Database,
      useFactory: () =>
        new Database(process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH),
    },
    // Validates every @Body/@Param/@Query that declares a { schema }.
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
