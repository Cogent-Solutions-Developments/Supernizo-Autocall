import 'server-only';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '@generated/prisma/client';
import { getDatabaseEnvironment } from '@/server/env';

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
};

const SERVERLESS_CONNECTION_LIMIT = 2;
const SERVERLESS_IDLE_TIMEOUT_SECONDS = 60;

export function configureDatabaseUrlForServerless(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('connectionLimit', String(SERVERLESS_CONNECTION_LIMIT));
  url.searchParams.set('idleTimeout', String(SERVERLESS_IDLE_TIMEOUT_SECONDS));
  return url.toString();
}

export function createDatabaseClient(
  databaseUrl = getDatabaseEnvironment().DATABASE_URL,
): PrismaClient {
  return new PrismaClient({
    // Each Vercel runtime has its own pool. A small pool avoids exhausting the
    // database's connection limit when the application scales horizontally.
    adapter: new PrismaMariaDb(configureDatabaseUrlForServerless(databaseUrl)),
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
