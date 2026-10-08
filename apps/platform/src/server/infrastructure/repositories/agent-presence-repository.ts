import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  AgentPresenceRepository,
  AgentPresenceRepositorySession,
} from '@/server/application/ports/agent-presence-repository';

function bindRepository(getClient: () => Prisma.TransactionClient): AgentPresenceRepositorySession {
  return {
    async countActiveCalls(agentId) {
      const database = getClient();
      return database.call.count({
        where: {
          agentId,
          status: { notIn: ['REJECTED', 'ENDED', 'MISSED', 'FAILED', 'CANCELLED'] },
        },
      });
    },
  };
}

export function createAgentPresenceRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): AgentPresenceRepository {
  return { ...bindRepository(getClient) };
}
