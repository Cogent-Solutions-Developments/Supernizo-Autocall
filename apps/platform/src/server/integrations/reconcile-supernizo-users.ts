// Run with pnpm directory:reconcile; the launcher supplies server conditions and TS aliases.
import { getDatabaseClient } from '@/server/db/client';
import { fetchDirectoryUser } from '@/server/integrations/supernizo-directory-client';
import { directorySyncEnabled } from '@/server/integrations/supernizo-signature';
import { applyDirectoryState } from '@/server/services/supernizo-directory-service';

async function main() {
  if (!directorySyncEnabled())
    throw new Error('Enable directory synchronization before reconciling existing SSO users.');
  const database = getDatabaseClient();
  let cursor: string | undefined;
  let synchronized = 0;
  try {
    while (true) {
      const users = await database.user.findMany({
        where: { supernizoId: { not: null } },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, supernizoId: true },
      });
      if (!users.length) break;
      for (const user of users) {
        if (!user.supernizoId) continue;
        const state = await fetchDirectoryUser(user.supernizoId);
        await database.$transaction((tx) => applyDirectoryState(tx, state));
        synchronized++;
      }
      cursor = users.at(-1)?.id;
    }
    console.log(JSON.stringify({ event: 'directory_existing_users_reconciled', synchronized }));
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Directory reconciliation failed.');
  process.exitCode = 1;
});
