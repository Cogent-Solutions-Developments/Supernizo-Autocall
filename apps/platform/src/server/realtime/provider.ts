import 'server-only';

import type { RealtimeEvent } from '@supernizo/shared';

export type { RealtimeEvent } from '@supernizo/shared';

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
