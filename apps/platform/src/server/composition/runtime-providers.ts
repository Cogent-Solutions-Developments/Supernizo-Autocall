import { isRetryableWriteError } from '@/server/infrastructure/db/errors';
import { fetchDirectoryUser } from '@/server/infrastructure/integrations/supernizo-directory-client';
import { directorySyncEnabled } from '@/server/infrastructure/integrations/supernizo-signature';
import 'server-only';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';
import { getEnvironmentReadiness } from '@/server/infrastructure/config/env';
import { UpstashRealtimeProvider } from '@/server/infrastructure/realtime';
import { getPresenceRepository } from '@/server/infrastructure/presence/presence-repository';
import { getAgentPresenceRepository } from '@/server/infrastructure/presence/agent-presence-repository';
import { terminateLiveKitRoom } from '@/server/infrastructure/livekit/room-service';
import { notifySupernizoCallResolution } from '@/server/infrastructure/integrations/supernizo-call-resolution-client';
import { createVisitorRealtimeToken } from '@/server/infrastructure/realtime/visitor-token';
import { lookupApproximateGeo } from '@/server/infrastructure/geoip/reader';
import { readTrustedClientIp } from '@/server/infrastructure/http/client-ip';
import {
  getLiveKitPublicConfig,
  getLiveKitServerConfig,
} from '@/server/infrastructure/livekit/config';
import { createLiveKitParticipantToken } from '@/server/infrastructure/livekit/participant-token';
import { logger } from '@/server/infrastructure/logging/logger';
export const runtimeProviders: RuntimeProviders = {
  isRetryableWriteError,
  fetchDirectoryUser: (...args) => fetchDirectoryUser(...args),
  directorySyncEnabled: (...args) => directorySyncEnabled(...args),
  getEnvironmentReadiness: (...args) => getEnvironmentReadiness(...args),
  getRealtimeProvider: () => new UpstashRealtimeProvider(),
  getPresenceRepository: (...args) => getPresenceRepository(...args),
  getAgentPresenceRepository: (...args) => getAgentPresenceRepository(...args),
  terminateLiveKitRoom: (...args) => terminateLiveKitRoom(...args),
  notifySupernizoCallResolution: (...args) => notifySupernizoCallResolution(...args),
  createVisitorRealtimeToken: (...args) => createVisitorRealtimeToken(...args),
  lookupApproximateGeo: (...args) => lookupApproximateGeo(...args),
  readTrustedClientIp: (...args) => readTrustedClientIp(...args),
  getLiveKitPublicConfig: (...args) => getLiveKitPublicConfig(...args),
  getLiveKitServerConfig: (...args) => getLiveKitServerConfig(...args),
  createLiveKitParticipantToken: (...args) => createLiveKitParticipantToken(...args),
  getCallTimingSource: () => process.env,
  logger,
};
