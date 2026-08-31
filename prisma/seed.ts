import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { hash } from 'bcryptjs';
import { config } from 'dotenv';

import { PrismaClient } from '../generated/prisma/client';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const databaseUrl = process.env.DATABASE_URL;
const localAdminPassword = process.env.LOCAL_ADMIN_PASSWORD;

if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before running the Prisma seed.');
}

if (!localAdminPassword || localAdminPassword.length < 12) {
  throw new Error(
    'LOCAL_ADMIN_PASSWORD must be set to a unique value of at least 12 characters before running the Prisma seed.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
});

async function seed(): Promise<void> {
  const passwordHash = await hash(localAdminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@local.test' },
    update: {
      displayName: 'Local admin',
      globalRole: 'ADMIN',
      passwordHash,
    },
    create: {
      displayName: 'Local admin',
      email: 'admin@local.test',
      globalRole: 'ADMIN',
      passwordHash,
    },
  });
  const site = await prisma.site.upsert({
    where: { publicKey: 'site_demo_local' },
    update: {
      allowedOrigins: ['http://localhost:3100'],
      name: 'Demo Site',
    },
    create: {
      allowedOrigins: ['http://localhost:3100'],
      name: 'Demo Site',
      publicKey: 'site_demo_local',
    },
  });

  await prisma.siteMember.upsert({
    where: {
      siteId_userId: {
        siteId: site.id,
        userId: admin.id,
      },
    },
    update: { role: 'ADMIN' },
    create: {
      role: 'ADMIN',
      siteId: site.id,
      userId: admin.id,
    },
  });
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });
