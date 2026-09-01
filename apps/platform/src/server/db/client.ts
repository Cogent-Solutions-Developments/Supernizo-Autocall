import 'server-only';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '@generated/prisma/client';
import { getDatabaseEnvironment } from '@/server/env';

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
};

export function createDatabaseClient(
  databaseUrl = getDatabaseEnvironment().DATABASE_URL,
): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
  });
}

const prismaGlobal = globalThis as PrismaGlobal;

export function getDatabaseClient(): PrismaClient {
  const client = prismaGlobal.prisma ?? createDatabaseClient();

  // A dashboard render makes several database calls. Reusing one client per
  // Node.js runtime prevents each call from creating a separate MariaDB pool.
  prismaGlobal.prisma = client;

  return client;
}
