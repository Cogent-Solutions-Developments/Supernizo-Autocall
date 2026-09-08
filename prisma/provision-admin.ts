import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

import { PrismaClient } from '../generated/prisma/client';

function readRequiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Admin provisioning configuration is invalid: ${name}.`);
  }

  return value;
}

const adminDisplayName = process.env.ADMIN_DISPLAY_NAME?.trim() || 'Production administrator';
const adminEmail = readRequiredEnvironment('ADMIN_EMAIL').toLowerCase();
const adminPassword = readRequiredEnvironment('ADMIN_PASSWORD');
const databaseUrl = readRequiredEnvironment('DATABASE_URL');

if (adminEmail.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  throw new Error('Admin provisioning configuration is invalid: ADMIN_EMAIL.');
}
if (adminPassword.length < 16 || adminPassword.length > 1024) {
  throw new Error('Admin provisioning configuration is invalid: ADMIN_PASSWORD.');
}
if (adminDisplayName.length > 191) {
  throw new Error('Admin provisioning configuration is invalid: ADMIN_DISPLAY_NAME.');
}

let databaseProtocol: string;
try {
  databaseProtocol = new URL(databaseUrl).protocol;
} catch {
  throw new Error('Admin provisioning configuration is invalid: DATABASE_URL.');
}
if (!['postgres:', 'postgresql:'].includes(databaseProtocol)) {
  throw new Error('Admin provisioning configuration is invalid: DATABASE_URL.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function provisionAdmin(): Promise<void> {
  const passwordHash = await hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      displayName: adminDisplayName,
      globalRole: 'ADMIN',
      passwordHash,
    },
    create: {
      displayName: adminDisplayName,
      email: adminEmail,
      globalRole: 'ADMIN',
      passwordHash,
    },
  });

  process.stdout.write(`Administrator provisioned: ${adminEmail}\n`);
}

provisionAdmin()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });
