import { reconcileDirectoryUsers } from '@/server/composition/directory/supernizo-directory-service';
import { closeDatabase } from '@/server/composition/database-lifecycle';
async function main() {
  try {
    const synchronized = await reconcileDirectoryUsers();
    console.log(JSON.stringify({ event: 'directory_existing_users_reconciled', synchronized }));
  } finally {
    await closeDatabase();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Directory reconciliation failed.');
  process.exitCode = 1;
});
