import 'server-only';
import { Prisma } from '@generated/prisma/client';
function buildCallParticipantLockQueries(
  agentId: string,
  visitorId: string,
): readonly [Prisma.Sql, Prisma.Sql] {
  return [
    Prisma.sql`SELECT id FROM "User" WHERE id = ${agentId} FOR UPDATE`,
    Prisma.sql`SELECT id FROM "Visitor" WHERE id = ${visitorId} FOR UPDATE`,
  ];
}
export async function lockCallParticipants(
  executeQuery: (query: Prisma.Sql) => Promise<unknown>,
  agentId: string,
  visitorId: string,
): Promise<void> {
  for (const query of buildCallParticipantLockQueries(agentId, visitorId)) {
    await executeQuery(query);
  }
}
