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

export const DashboardDateRangeSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine(({ from, to }) => from <= to, 'The start date must be on or before the end date.')
  .refine(({ from, to }) => {
    const start = Date.parse(`${from}T00:00:00.000Z`);
    const end = Date.parse(`${to}T00:00:00.000Z`);
    return end - start <= 366 * 24 * 60 * 60 * 1_000;
  }, 'The selected period may not exceed 366 days.');

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
export const AgentAvailabilitySchema = z.enum(['AVAILABLE', 'BUSY', 'OFFLINE']);
export const AgentPresenceHeartbeatSchema = z.object({
  availability: AgentAvailabilitySchema,
});

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
    authorizationToken: z.string().trim().min(1).max(2048),
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

const SafeEventValueSchema = z.union([
  z.string().max(256),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const SafeEventMetadataSchema = z
  .record(z.string().trim().min(1).max(64), SafeEventValueSchema)
  .refine(
    (metadata) => Object.keys(metadata).length <= 20,
    'Metadata may contain at most 20 values.',
  );

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

export const ChatSenderTypeSchema = z.enum(['VISITOR', 'AGENT', 'SYSTEM']);
export const ChatMessageContentSchema = z.string().trim().min(1).max(2_000);

export const ChatMessageSchema = z.object({
  content: ChatMessageContentSchema,
  id: IdSchema,
  senderName: z.string().trim().min(1).max(191).nullable(),
  senderType: ChatSenderTypeSchema,
  sentAt: UtcDateTimeSchema,
  threadId: IdSchema,
});

export const ChatThreadSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  visitorId: IdSchema,
});

export const ChatThreadCreateRequestSchema = z.object({
  siteId: IdSchema,
  visitorId: IdSchema,
});

export const ChatAgentMessageRequestSchema = z.object({
  content: ChatMessageContentSchema,
});

export const ChatVisitorMessageRequestSchema = z.object({
  content: ChatMessageContentSchema,
  context: TrackingContextSchema,
});

export const ChatHistoryQuerySchema = PaginationSchema;

export const CallTypeSchema = z.enum(['AUDIO', 'VIDEO']);
export const CallStatusSchema = z.enum([
  'RINGING',
  'ACCEPTED',
  'REJECTED',
  'CONNECTING',
  'ACTIVE',
  'ENDED',
  'MISSED',
  'FAILED',
  'CANCELLED',
]);

export const CallSchema = z.object({
  agentDisplayName: z.string().trim().min(1).max(191).nullable(),
  id: IdSchema,
  requestedAt: UtcDateTimeSchema,
  roomName: z.string().trim().min(1).max(191),
  siteId: IdSchema,
  status: CallStatusSchema,
  type: CallTypeSchema,
  visitorId: IdSchema,
});

export const CallCreateRequestSchema = z.object({
  siteId: IdSchema,
  type: CallTypeSchema,
  visitorId: IdSchema,
});

export const CallVisitorActionRequestSchema = z.object({
  context: TrackingContextSchema,
});

export const CallHistoryQuerySchema = z.object({
  agentId: IdSchema.optional(),
  from: z.iso.date().optional(),
  siteId: IdSchema.optional(),
  status: CallStatusSchema.optional(),
  to: z.iso.date().optional(),
  type: CallTypeSchema.optional(),
});

export const LiveKitParticipantRoleSchema = z.enum(['AGENT', 'VISITOR']);
export const LiveKitTokenRequestSchema = z.object({
  callId: IdSchema,
  context: TrackingContextSchema.optional(),
  participantRole: LiveKitParticipantRoleSchema,
});
export const LiveKitTokenResponseSchema = z.object({
  token: z.string().trim().min(1).max(8_192),
  url: z.url(),
});

export const VisitorPresenceSnapshotSchema = z.object({
  activeDurationSeconds: z.number().int().nonnegative(),
  anonymousVisitorId: AnonymousTrackerIdSchema,
  browserName: z.string().max(64).nullable(),
  city: z.string().max(191).nullable(),
  country: z.string().max(2).nullable(),
  currentUrl: z.string().max(2048).nullable(),
  deviceType: z.string().max(32).nullable(),
  intentScore: z.number().int().min(0).max(100).nullable(),
  lastSeenAt: UtcDateTimeSchema,
  returningVisitCount: z.number().int().positive(),
  sessionId: z.string().trim().min(1).max(191),
  siteId: IdSchema,
  source: z.string().max(191).nullable(),
  visitorId: IdSchema,
});

export const RealtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visitor.online'), visitor: VisitorPresenceSnapshotSchema }),
  z.object({ type: z.literal('visitor.updated'), visitor: VisitorPresenceSnapshotSchema }),
  z.object({ type: z.literal('visitor.offline'), visitorId: IdSchema }),
  z.object({ type: z.literal('call.incoming'), call: CallSchema }),
  z.object({ type: z.literal('call.status'), call: CallSchema }),
  z.object({ type: z.literal('chat.message'), message: ChatMessageSchema }),
]);

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
export type AgentAvailability = z.infer<typeof AgentAvailabilitySchema>;
export type ChatAgentMessageRequest = z.infer<typeof ChatAgentMessageRequestSchema>;
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuerySchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatSenderType = z.infer<typeof ChatSenderTypeSchema>;
export type ChatThread = z.infer<typeof ChatThreadSchema>;
export type ChatThreadCreateRequest = z.infer<typeof ChatThreadCreateRequestSchema>;
export type ChatVisitorMessageRequest = z.infer<typeof ChatVisitorMessageRequestSchema>;
export type Call = z.infer<typeof CallSchema>;
export type CallCreateRequest = z.infer<typeof CallCreateRequestSchema>;
export type CallStatus = z.infer<typeof CallStatusSchema>;
export type CallType = z.infer<typeof CallTypeSchema>;
export type CallVisitorActionRequest = z.infer<typeof CallVisitorActionRequestSchema>;
export type LiveKitParticipantRole = z.infer<typeof LiveKitParticipantRoleSchema>;
export type LiveKitTokenRequest = z.infer<typeof LiveKitTokenRequestSchema>;
export type LiveKitTokenResponse = z.infer<typeof LiveKitTokenResponseSchema>;
export type Cursor = z.infer<typeof CursorSchema>;
export type DashboardDateRange = z.infer<typeof DashboardDateRangeSchema>;
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
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
export type VisitorPresenceSnapshot = z.infer<typeof VisitorPresenceSnapshotSchema>;
