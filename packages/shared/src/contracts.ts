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

export const SiteCreateSchema = z
  .object({
    allowedOrigins: AllowedOriginsInputSchema,
    consentMode: z.string().trim().min(1).max(32).nullable().optional(),
    eventRetentionDays: z.number().int().min(1).max(3650).nullable().optional(),
    name: z.string().trim().min(1).max(191),
    widgetAvatarUrl: OptionalHttpUrlSchema,
    widgetDisplayName: z.string().trim().min(1).max(191).nullable().optional(),
    widgetLogoUrl: OptionalHttpUrlSchema,
  })
  .merge(SiteFeatureFlagsSchema);

export const SiteUpdateSchema = SiteCreateSchema.partial().extend({
  status: SiteStatusSchema.optional(),
});

export const SiteSettingsSchema = SiteCreateSchema.extend({
  createdAt: UtcDateTimeSchema,
  id: IdSchema,
  publicKey: z.string().min(1).max(191),
  status: SiteStatusSchema,
  updatedAt: UtcDateTimeSchema,
});

export const SitePublicKeySchema = z
  .string()
  .trim()
  .regex(/^site_[A-Za-z0-9_-]{8,191}$/, 'Must be a valid public site key.');
export const AnonymousTrackerIdSchema = z.string().uuid();

export const TrackerClientHintsSchema = z
  .object({
    brands: z
      .array(
        z.object({
          brand: z.string().max(128),
          version: z.string().max(64),
        }),
      )
      .max(10)
      .optional(),
    mobile: z.boolean().optional(),
    platform: z.string().max(128).optional(),
  })
  .optional();

export const TrackerBrowserMetadataSchema = z.object({
  clientHints: TrackerClientHintsSchema,
  language: z.string().trim().min(1).max(64),
  referrer: z.url().max(2048).nullable(),
  screenHeight: z.number().int().min(0).max(20_000),
  screenWidth: z.number().int().min(0).max(20_000),
  timezone: z.string().trim().min(1).max(128).nullable(),
  title: z.string().max(512),
  url: z.url().max(2048),
  userAgent: z.string().max(1024),
});

export const TrackerBootstrapRequestSchema = z.object({
  browser: TrackerBrowserMetadataSchema,
  sessionId: AnonymousTrackerIdSchema,
  sitePublicKey: SitePublicKeySchema,
  visitorId: AnonymousTrackerIdSchema,
});

export const TrackerBootstrapResponseSchema = z.object({
  features: SiteFeatureFlagsSchema,
  heartbeatIntervalSeconds: z.number().int().positive(),
  realtime: z.object({
    channel: z.string().trim().min(1).max(255),
  }),
  sessionId: AnonymousTrackerIdSchema,
  visitorId: AnonymousTrackerIdSchema,
});

export const AnonymousPageViewIdSchema = z.string().uuid();

export const TrackingContextSchema = z.object({
  sessionId: AnonymousTrackerIdSchema,
  sitePublicKey: SitePublicKeySchema,
  visitorId: AnonymousTrackerIdSchema,
});

const TrackingPageSchema = z.object({
  pageViewId: AnonymousPageViewIdSchema,
  path: z.string().trim().min(1).max(2048),
  title: z.string().max(512),
  url: z.url().max(2048),
});

export const TrackerPageRequestSchema = TrackingContextSchema.merge(TrackingPageSchema);

const ActiveSecondsDeltaSchema = z.number().int().min(0).max(900);
const ScrollPercentSchema = z.number().int().min(0).max(100);

export const TrackerHeartbeatRequestSchema = TrackingContextSchema.extend({
  activeSecondsDelta: ActiveSecondsDeltaSchema,
  maxScrollPercent: ScrollPercentSchema,
  pageViewId: AnonymousPageViewIdSchema,
});

export const TrackerPageLeaveRequestSchema = TrackerHeartbeatRequestSchema;

const SafeEventValueSchema = z.union([z.string().max(256), z.number().finite(), z.boolean(), z.null()]);
export const SafeEventMetadataSchema = z
  .record(z.string().trim().min(1).max(64), SafeEventValueSchema)
  .refine((metadata) => Object.keys(metadata).length <= 20, 'Metadata may contain at most 20 values.');

export const TrackerEventTypeSchema = z.enum([
  'cta_click',
  'custom',
  'download',
  'form_start',
  'form_submit',
  'scroll_depth',
]);

export const TrackerEventRequestSchema = TrackingContextSchema.extend({
  metadata: SafeEventMetadataSchema.default({}),
  name: z.string().trim().min(1).max(128),
  pageViewId: AnonymousPageViewIdSchema.optional(),
  type: TrackerEventTypeSchema,
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
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;
export type StaffRole = z.infer<typeof StaffRoleSchema>;
export type TrackerBootstrapRequest = z.infer<typeof TrackerBootstrapRequestSchema>;
export type TrackerBootstrapResponse = z.infer<typeof TrackerBootstrapResponseSchema>;
export type TrackerEventRequest = z.infer<typeof TrackerEventRequestSchema>;
export type TrackerHeartbeatRequest = z.infer<typeof TrackerHeartbeatRequestSchema>;
export type TrackerPageLeaveRequest = z.infer<typeof TrackerPageLeaveRequestSchema>;
export type TrackerPageRequest = z.infer<typeof TrackerPageRequestSchema>;
export type TrackingContext = z.infer<typeof TrackingContextSchema>;
