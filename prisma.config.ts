import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

// This fallback supports offline schema validation and client generation only.
// The server database client always requires a real DATABASE_URL through env.ts.
const databaseUrl =
  process.env.DATABASE_URL ?? 'mysql://supernizo:supernizo@127.0.0.1:3306/supernizo';

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
