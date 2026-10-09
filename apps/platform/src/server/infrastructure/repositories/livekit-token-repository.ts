import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  LivekitTokenRepository,
  LivekitTokenRepositorySession,
} from '@/server/application/ports/livekit-token-repository';

function bindRepository(getClient: () => Prisma.TransactionClient): LivekitTokenRepositorySession {
  return {
    async findTokenCall(callId) {
      const database = getClient();
      return database.call.findUnique({
        where: { id: callId },
        select: {
          agentId: true,
          id: true,
          roomName: true,
          sessionId: true,
          status: true,
          visitorId: true,
        },
      });
    },
    async findRoomCall(input) {
      const database = getClient();
      return database.call.findUnique({
        where: { roomName: input.roomName },
        select: { agentId: true, id: true, status: true, visitorId: true },
      });
    },
    async listMediaEvents(call) {
      const database = getClient();
      return database.callEvent.findMany({
        where: { callId: call.id, type: { startsWith: 'LIVEKIT_' } },
        select: { payload: true, type: true },
      });
    },
    async recordMediaEvent(call, input, payload) {
      const database = getClient();
      return database.callEvent.create({
        data: {
          callId: call.id,
          type: `LIVEKIT_${input.event.toUpperCase()}`,
          ...(Object.keys(payload).length > 0 ? { payload } : {}),
        },
      });
    },
    async listJoinEvents(call) {
      const database = getClient();
      return database.callEvent.findMany({
        where: { callId: call.id, type: 'LIVEKIT_PARTICIPANT_JOINED' },
        select: { payload: true },
      });
    },
    async getCallStatus(call) {
      const database = getClient();
      return database.call.findUnique({
        where: { id: call.id },
        select: { status: true },
      });
    },
  };
}

export function createLivekitTokenRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): LivekitTokenRepository {
  return { ...bindRepository(getClient) };
}
