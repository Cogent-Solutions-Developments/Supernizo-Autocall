import 'server-only';

import { Realtime } from '@upstash/realtime';
import { z } from 'zod';

import { CallSchema, ChatMessageSchema, VisitorPresenceSnapshotSchema } from '@supernizo/shared';

import { getRedisClient } from '@/server/redis/client';

import type { RealtimeEvent, RealtimeProvider, RealtimeProviderServerConfig } from './provider';

const realtimeSchema = {
  visitor: {
    online: z.object({ visitor: VisitorPresenceSnapshotSchema }),
    updated: z.object({ visitor: VisitorPresenceSnapshotSchema }),
  },
  chat: {
    message: z.object({ message: ChatMessageSchema }),
  },
  call: {
    incoming: z.object({ call: CallSchema }),
    status: z.object({ call: CallSchema }),
  },
} as const;

export function createUpstashRealtimeClient() {
  return new Realtime({ redis: getRedisClient(), schema: realtimeSchema });
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
    await this.emitWithClient(this.client, event);
  }

  public async emitToChannel(channel: string, event: RealtimeEvent): Promise<void> {
    await this.emitWithClient(this.client.channel(channel), event);
  }

  public getServerConfig(): RealtimeProviderServerConfig {
    return serverConfig;
  }

  private async emitWithClient(
    client: Pick<UpstashRealtimeClient, 'emit'>,
    event: RealtimeEvent,
  ): Promise<void> {
    if (event.type === 'visitor.online') {
      await client.emit('visitor.online', { visitor: event.visitor });
      return;
    }
    if (event.type === 'visitor.updated') {
      await client.emit('visitor.updated', { visitor: event.visitor });
      return;
    }

    if (event.type === 'visitor.offline') {
      return;
    }

    if (event.type === 'chat.message') {
      await client.emit('chat.message', { message: event.message });
      return;
    }

    if (event.type === 'call.incoming') {
      await client.emit('call.incoming', { call: event.call });
      return;
    }

    if (event.type === 'call.status') {
      await client.emit('call.status', { call: event.call });
    }
  }
}
