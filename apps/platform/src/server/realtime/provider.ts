import 'server-only';

export type RealtimeEvent = Readonly<{
  event: string;
  payload: unknown;
}>;

export type RealtimeProviderServerConfig = Readonly<{
  defaultEvent: 'platform.event';
  provider: 'upstash-realtime';
  transport: 'sse';
}>;

export interface RealtimeProvider {
  emit(event: RealtimeEvent): Promise<void>;
  emitToChannel(channel: string, event: RealtimeEvent): Promise<void>;
  getServerConfig(): RealtimeProviderServerConfig;
}
