import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    '--conditions=react-server',
    '--import=tsx',
    'apps/platform/src/server/integrations/reconcile-supernizo-users.ts',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: fileURLToPath(new URL('../apps/platform/tsconfig.json', import.meta.url)),
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
