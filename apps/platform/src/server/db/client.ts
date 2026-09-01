import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';

import { PrismaClient } from '@generated/prisma/client';
import { getDatabaseEnvironment, type DatabaseEnvironment } from '@/server/env';

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
};

const CONNECTION_LIMIT = 10;
const CONNECTION_TIMEOUT_MILLISECONDS = 5_000;
const IDLE_TIMEOUT_MILLISECONDS = 30_000;

export function configurePostgresPool(environment: DatabaseEnvironment): PoolConfig {
  return {
    allowExitOnIdle: true,
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MILLISECONDS,
    idleTimeoutMillis: IDLE_TIMEOUT_MILLISECONDS,
    max: CONNECTION_LIMIT,
    ssl: false,
  };
}

export function createDatabaseClient(environment = getDatabaseEnvironment()): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(configurePostgresPool(environment)),
  });
}

const prismaGlobal = globalThis as PrismaGlobal;

export function getDatabaseClient(): PrismaClient {
  const client = prismaGlobal.prisma ?? createDatabaseClient();

  // The self-hosted process serves multiple requests, so reuse one pool for the
  // lifetime of the process instead of creating a client for every request.
  prismaGlobal.prisma = client;

  return client;
}
