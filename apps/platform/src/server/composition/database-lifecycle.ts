import 'server-only';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
export async function closeDatabase(): Promise<void> {
  await getDatabaseClient().$disconnect();
}
