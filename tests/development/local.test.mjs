import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'dotenv';
import { environment, initialize } from '../../ops/development/local.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'autocall-local-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, '.env.development.local');
}

test('initialization creates unique secrets without overwriting existing settings', async (t) => {
  const file = await fixture(t);
  await initialize(file);
  const first = await readFile(file, 'utf8');
  const values = parse(first);
  for (const key of ['AUTH_SECRET', 'TRACKING_IP_HASH_SECRET', 'LOCAL_ADMIN_PASSWORD']) {
    assert.match(values[key], /^[a-f0-9]{64}$/);
  }
  assert.notEqual(values.AUTH_SECRET, values.TRACKING_IP_HASH_SECRET);
  await initialize(file);
  assert.equal(await readFile(file, 'utf8'), first);
});

test('local configuration overrides inherited database and disables cross-environment sync', async (t) => {
  const file = await fixture(t);
  await initialize(file);
  const result = await environment(file, {
    DATABASE_URL: 'postgresql://remote.invalid/production',
    BRIDGE_TEST_DATABASE_URL: 'postgresql://remote.invalid/production',
    SUPERNIZO_DIRECTORY_SYNC_ENABLED: 'true',
    SUPERNIZO_NOTIFICATION_SYNC_ENABLED: 'true',
  });
  assert.equal(new URL(result.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(new URL(result.DATABASE_URL).port, '15433');
  assert.equal(result.BRIDGE_TEST_DATABASE_URL, '');
  assert.equal(result.SUPERNIZO_DIRECTORY_SYNC_ENABLED, 'false');
  assert.equal(result.SUPERNIZO_NOTIFICATION_SYNC_ENABLED, 'false');
});

test('local commands reject a remote database before running migrations or seeds', async (t) => {
  const file = await fixture(t);
  await writeFile(file, 'DATABASE_URL=postgresql://remote.invalid/production');
  await assert.rejects(environment(file), /dedicated loopback database/);
});
