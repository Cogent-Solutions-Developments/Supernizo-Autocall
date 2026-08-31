import { z } from 'zod';

export const IdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Must be a stable application identifier.');

export const RequestIdSchema = z.string().uuid();
export const CursorSchema = z.string().trim().min(1).max(512);

export const PaginationSchema = z.object({
  cursor: CursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const ApiErrorCodeSchema = z.enum([
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
]);

export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
    requestId: RequestIdSchema,
  }),
});

export const UtcDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => value.endsWith('Z'), 'Must be an ISO 8601 timestamp in UTC.');

export const StaffRoleSchema = z.enum(['ADMIN', 'AGENT', 'VIEWER']);
export const SiteStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const OriginInputSchema = z.string().trim().min(1).max(2048);
export const AllowedOriginsInputSchema = z.array(OriginInputSchema).min(1).max(100);

export const SiteFeatureFlagsSchema = z.object({
  audioCallEnabled: z.boolean().default(true),
  chatEnabled: z.boolean().default(true),
  trackingEnabled: z.boolean().default(true),
  videoCallEnabled: z.boolean().default(true),
});

const OptionalHttpUrlSchema = z.url().max(2048).nullable().optional();

export const SiteCreateSchema = z.object({
  allowedOrigins: AllowedOriginsInputSchema,
  consentMode: z.string().trim().min(1).max(32).nullable().optional(),
  eventRetentionDays: z.number().int().min(1).max(3650).nullable().optional(),
  name: z.string().trim().min(1).max(191),
  widgetAvatarUrl: OptionalHttpUrlSchema,
  widgetDisplayName: z.string().trim().min(1).max(191).nullable().optional(),
  widgetLogoUrl: OptionalHttpUrlSchema,
}).merge(SiteFeatureFlagsSchema);

export const SiteUpdateSchema = SiteCreateSchema.partial().extend({
  status: SiteStatusSchema.optional(),
});

export function createApiSuccessEnvelopeSchema<TSchema extends z.ZodType>(dataSchema: TSchema) {
  return z.object({
    data: dataSchema,
    requestId: RequestIdSchema,
  });
}

export function createPaginatedEnvelopeSchema<TSchema extends z.ZodType>(itemSchema: TSchema) {
  return z.object({
    data: z.array(itemSchema),
    nextCursor: CursorSchema.nullable(),
    requestId: RequestIdSchema,
  });
}

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
export type Cursor = z.infer<typeof CursorSchema>;
export type Id = z.infer<typeof IdSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type RequestId = z.infer<typeof RequestIdSchema>;
export type SiteCreateInput = z.infer<typeof SiteCreateSchema>;
export type SiteFeatureFlags = z.infer<typeof SiteFeatureFlagsSchema>;
export type SiteStatus = z.infer<typeof SiteStatusSchema>;
export type SiteUpdateInput = z.infer<typeof SiteUpdateSchema>;
export type StaffRole = z.infer<typeof StaffRoleSchema>;
