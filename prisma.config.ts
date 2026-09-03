import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

// Production migration and application containers both reach PostgreSQL only
// over the private Compose network.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://supernizo:supernizo@127.0.0.1:5432/supernizo';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
