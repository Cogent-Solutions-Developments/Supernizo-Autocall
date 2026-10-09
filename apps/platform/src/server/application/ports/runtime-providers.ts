import type { DirectoryState } from '@/server/domain/directory/supernizo-contract';
import type {
  AgentAvailability,
  VisitorPresenceSnapshot,
  Call,
  LiveKitTokenResponse,
} from '@supernizo/shared';
import type { RealtimeProvider } from './realtime-provider';
export type AgentPresenceSnapshot = Readonly<{
  availability: AgentAvailability;
  updatedAt: string;
}>;
export interface AgentPresenceStore {
  get(agentId: string): Promise<AgentPresenceSnapshot | null>;
  set(agentId: string, availability: AgentAvailability): Promise<AgentPresenceSnapshot>;
}
export interface VisitorPresenceStore {
  get(siteId: string, visitorId: string): Promise<VisitorPresenceSnapshot | null>;
  listBySite(siteId: string): Promise<VisitorPresenceSnapshot[]>;
  upsert(snapshot: VisitorPresenceSnapshot): Promise<{ wasOnline: boolean }>;
}
export type ApproximateGeo = Readonly<{
  geoCity: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
}>;
export type LiveKitServerConfig = Readonly<{ apiKey: string; apiSecret: string; url: string }>;
export interface RuntimeProviders {
  isRetryableWriteError(error: unknown): boolean;
  fetchDirectoryUser(subject: string): Promise<DirectoryState>;
  directorySyncEnabled(): boolean;
  getEnvironmentReadiness(): { realtime: boolean };
  getRealtimeProvider(): RealtimeProvider;
  getPresenceRepository(): VisitorPresenceStore;
  getAgentPresenceRepository(): AgentPresenceStore;
  terminateLiveKitRoom(roomName: string): Promise<boolean>;
  notifySupernizoCallResolution(call: Call): Promise<void>;
  createVisitorRealtimeToken(channel: string): string;
  lookupApproximateGeo(ipAddress: string): Promise<ApproximateGeo>;
  readTrustedClientIp(request: Request): string | null;
  getLiveKitPublicConfig(): { url: string };
  getLiveKitServerConfig(): LiveKitServerConfig;
  createLiveKitParticipantToken(
    input: Readonly<{ config?: LiveKitServerConfig; identity: string; roomName: string }>,
  ): Promise<LiveKitTokenResponse>;
  getCallTimingSource(): Readonly<Record<string, string | undefined>>;
  logger: {
    log(
      level: 'debug' | 'info' | 'warn' | 'error',
      event: string,
      metadata?: Readonly<Record<string, boolean | number | string | undefined>>,
    ): void;
  };
}
