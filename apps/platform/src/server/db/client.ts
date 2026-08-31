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

export const prisma = prismaGlobal.prisma ?? createDatabaseClient();

if (process.env.NODE_ENV !== 'production') {
  prismaGlobal.prisma = prisma;
}
