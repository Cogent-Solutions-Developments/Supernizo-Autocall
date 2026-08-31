import 'server-only';

import { Realtime } from '@upstash/realtime';
import { z } from 'zod';

import { redis } from '@/server/redis/client';

import type { RealtimeEvent, RealtimeProvider, RealtimeProviderServerConfig } from './provider';

const realtimeSchema = {
  platform: {
    event: z.object({
      event: z.string().trim().min(1).max(100),
      payload: z.unknown(),
    }),
  },
} as const;

function createUpstashRealtimeClient() {
  return new Realtime({ redis, schema: realtimeSchema });
}

type UpstashRealtimeClient = ReturnType<typeof createUpstashRealtimeClient>;

const serverConfig: RealtimeProviderServerConfig = {
  defaultEvent: 'platform.event',
  provider: 'upstash-realtime',
  transport: 'sse',
};

export class UpstashRealtimeProvider implements RealtimeProvider {
  public constructor(
    private readonly client: UpstashRealtimeClient = createUpstashRealtimeClient(),
  ) {}

  public async emit(event: RealtimeEvent): Promise<void> {
    await this.client.emit(serverConfig.defaultEvent, event);
  }

  public async emitToChannel(channel: string, event: RealtimeEvent): Promise<void> {
    await this.client.channel(channel).emit(serverConfig.defaultEvent, event);
  }

  public getServerConfig(): RealtimeProviderServerConfig {
    return serverConfig;
  }
}
