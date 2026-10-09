import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../../', import.meta.url);
const read = (file) => readFile(new URL(file, projectRoot), 'utf8');

test('existing forced SSH command still resolves its deploy script after checkout', async () => {
  const entry = await read('scripts/github-deploy-command.sh');
  assert.match(
    entry,
    /exec \/usr\/bin\/bash \/home\/deploy\/app\/autocall\/scripts\/deploy-production\.sh/,
  );
  const deploy = await read('scripts/deploy-production.sh');
  assert.match(deploy, /bash \.\/scripts\/validate-production-env\.sh/);
  assert.match(deploy, /--file docker-compose\.production\.yml/);
  await read('scripts/validate-production-env.sh');
  await read('scripts/production-env.sh');
  await read('docker-compose.production.yml');
});

test('the installed backup service keeps its existing script and Compose paths', async () => {
  const service = await read('ops/systemd/supernizo-autocall-backup.service');
  assert.match(
    service,
    /ExecStart=\/usr\/bin\/bash \/home\/deploy\/app\/autocall\/scripts\/backup-postgres\.sh/,
  );
  const backup = await read('scripts/backup-postgres.sh');
  assert.match(backup, /--file docker-compose\.production\.yml/);
  assert.match(backup, /source "\$\{script_directory\}\/production-env\.sh"/);
});

test('both Docker layouts describe the same production images and database volume', async () => {
  assert.equal(await read('Dockerfile'), await read('ops/docker/Dockerfile'));
  const compose = await read('docker-compose.production.yml');
  assert.equal(compose, await read('ops/docker/docker-compose.production.yml'));
  assert.match(compose, /name: supernizo-autocall-postgres-data/);
  assert.match(compose, /127\.0\.0\.1:\$\{APP_HOST_PORT:-3200\}:3000/);
  assert.doesNotMatch(compose, /LOCAL_ADMIN_PASSWORD|15433|admin@local\.test/);
});

test('production workflow builds the existing Dockerfile and validates compatibility', async () => {
  const workflow = await read('.github/workflows/production-deploy.yml');
  assert.equal((workflow.match(/file: Dockerfile/g) ?? []).length, 2);
  assert.match(workflow, /run: bash scripts\/check-public-routing\.sh/);
  assert.match(workflow, /tests\/deployment\/production-compatibility\.test\.mjs/);
  assert.equal(
    (
      workflow.match(
        /if: github\.ref == 'refs\/heads\/hetzner-prod' && github\.event_name != 'pull_request'/g,
      ) ?? []
    ).length,
    2,
  );
});

test('legacy directory reconciliation and test commands still resolve their modules', async () => {
  for (const [entry, target] of [
    [
      'scripts/reconcile-supernizo-users.mjs',
      'apps/platform/scripts/reconcile-supernizo-users.mjs',
    ],
    ['scripts/nginx-routing.test.mjs', 'tests/deployment/nginx-routing.test.mjs'],
    ['scripts/vercel-config.test.mjs', 'tests/deployment/vercel-config.test.mjs'],
  ]) {
    assert.equal((await read(entry)).trim(), `import '../${target}';`);
    await read(target);
  }
});
