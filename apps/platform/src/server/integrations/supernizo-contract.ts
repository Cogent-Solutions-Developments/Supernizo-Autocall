import { z } from 'zod';

export const DirectoryStateSchema = z
  .object({
    subject: z.uuid().transform((value) => value.toLowerCase()),
    directoryRevision: z
      .string()
      .regex(/^[1-9][0-9]{0,18}$/)
      .refine((value) => BigInt(value) <= 9223372036854775807n),
    changedAt: z.iso.datetime().transform((value) => new Date(value).toISOString()),
    user: z
      .object({
        displayName: z.string().trim().min(1).max(191),
        role: z.enum(['ADMIN', 'AGENT']),
        eligibility: z.enum(['ELIGIBLE', 'REVOKED', 'DISABLED', 'DELETED']),
      })
      .strict(),
  })
  .strict();

export const DirectoryEventSchema = DirectoryStateSchema.extend({
  eventId: z.uuid().transform((value) => value.toLowerCase()),
  schemaVersion: z.literal(1),
}).strict();

export type DirectoryState = z.infer<typeof DirectoryStateSchema>;
export type DirectoryEvent = z.infer<typeof DirectoryEventSchema>;
