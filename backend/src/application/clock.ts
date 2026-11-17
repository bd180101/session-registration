import { Injectable } from '@nestjs/common';

/** The current time, behind a class so tests can substitute a fixed clock. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
