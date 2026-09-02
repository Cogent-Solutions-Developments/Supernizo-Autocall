import 'server-only';

import { RoomServiceClient } from 'livekit-server-sdk';

import { logger } from '@/server/logging/logger';

import { getLiveKitServerConfig, type LiveKitServerConfig } from './config';

export type LiveKitRoomDeletionClient = Readonly<{
  deleteRoom: (roomName: string) => Promise<void>;
}>;

function createRoomDeletionClient(config: LiveKitServerConfig): LiveKitRoomDeletionClient {
  return new RoomServiceClient(config.url, config.apiKey, config.apiSecret, {
    requestTimeout: 5,
  });
}

export async function terminateLiveKitRoom(
  roomName: string,
  client?: LiveKitRoomDeletionClient,
): Promise<boolean> {
  try {
    await (client ?? createRoomDeletionClient(getLiveKitServerConfig())).deleteRoom(roomName);
    logger.log('info', 'livekit_room_terminated', { roomName });
    return true;
  } catch (error: unknown) {
    logger.log('warn', 'livekit_room_termination_failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      roomName,
    });
    return false;
  }
}
