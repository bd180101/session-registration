import { z } from 'zod';

// Request validation: the shape of what clients may send. Business rules are
// checked again in the domain; this layer only rejects malformed input early,
// with a message per field.

// Date-times must carry "Z" or an offset, so a request is never read in the
// server's own time zone.
const dateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const createSessionSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  startsAt: dateTime,
  capacity: z
    .number()
    .int()
    .min(1, 'Capacity must be at least 1')
    .max(10_000, 'Capacity can be at most 10,000'),
  registrationOpensAt: dateTime,
  registrationClosesAt: dateTime,
});

export const registrationSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
});

// Looking up an email's registrations is a plain match, so a malformed email
// simply matches nothing; only the type and length are checked.
export const emailQuerySchema = z.string().max(254).optional();

export type CreateSessionRequest = z.output<typeof createSessionSchema>;
export type RegistrationRequest = z.output<typeof registrationSchema>;
