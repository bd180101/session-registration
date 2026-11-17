import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, type DomainErrorCode } from '../domain/domain-error';

const STATUS_BY_CODE: Record<DomainErrorCode, HttpStatus> = {
  INVALID_SESSION: HttpStatus.BAD_REQUEST,
  INVALID_EMAIL: HttpStatus.BAD_REQUEST,
  SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_REGISTERED: HttpStatus.NOT_FOUND,
  ALREADY_REGISTERED: HttpStatus.CONFLICT,
  REGISTRATION_NOT_OPEN: HttpStatus.CONFLICT,
  REGISTRATION_CLOSED: HttpStatus.CONFLICT,
  SESSION_FULL: HttpStatus.CONFLICT,
  SESSION_STARTED: HttpStatus.CONFLICT,
};

/** Sends a broken business rule as `{ statusCode, code, message }`; the UI keys its message off `code`. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    const statusCode = STATUS_BY_CODE[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, code: error.code, message: error.message });
  }
}
