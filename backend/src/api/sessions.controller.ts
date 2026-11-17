import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SessionsService } from '../application/sessions.service';
import {
  createSessionSchema,
  emailQuerySchema,
  registrationSchema,
} from './sessions.requests';
import type {
  CreateSessionRequest,
  RegistrationRequest,
} from './sessions.requests';
import {
  toRegistrationResponse,
  toSessionResponse,
  toSessionSummaryResponse,
} from './sessions.responses';
import type {
  RegistrationResponse,
  SessionResponse,
  SessionSummaryResponse,
} from './sessions.responses';

/** HTTP routes: validate the request, run a use case, shape the response. */
@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  listUpcoming(
    @Query('email', { schema: emailQuerySchema }) email?: string,
  ): SessionSummaryResponse[] {
    return this.sessions
      .listUpcoming(email)
      .map((summary) => toSessionSummaryResponse(summary));
  }

  @Post()
  create(
    @Body({ schema: createSessionSchema }) body: CreateSessionRequest,
  ): SessionResponse {
    return toSessionResponse(this.sessions.create(body));
  }

  @Post(':id/registrations')
  register(
    @Param('id') id: string,
    @Body({ schema: registrationSchema }) body: RegistrationRequest,
  ): RegistrationResponse {
    return toRegistrationResponse(id, this.sessions.register(id, body.email));
  }

  @Delete(':id/registrations/:email')
  @HttpCode(HttpStatus.NO_CONTENT)
  unregister(@Param('id') id: string, @Param('email') email: string): void {
    this.sessions.unregister(id, email);
  }
}
