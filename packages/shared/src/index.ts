import { z } from 'zod';

export * from './contracts';

export const VisitorEventTypeSchema = z.enum(['page_view', 'cta', 'custom']);

export const VisitorEventSchema = z.object({
  type: VisitorEventTypeSchema,
  name: z.string().trim().min(1).max(100),
  occurredAt: z.string().datetime(),
  properties: z.record(z.string(), z.unknown()).default({}),
});

export type VisitorEvent = z.infer<typeof VisitorEventSchema>;
export type VisitorEventType = z.infer<typeof VisitorEventTypeSchema>;

export const CallStateSchema = z.enum([
  'pending',
  'ringing',
  'accepted',
  'declined',
  'missed',
  'cancelled',
  'ended',
]);

export type CallState = z.infer<typeof CallStateSchema>;
