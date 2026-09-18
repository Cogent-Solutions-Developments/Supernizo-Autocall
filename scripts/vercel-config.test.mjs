import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);

async function readConfiguration(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, projectRoot), 'utf8'));
}

for (const relativePath of ['vercel.json', 'apps/platform/vercel.json']) {
  test(`${relativePath} disables automatic Vercel Git deployments only for hetzner-prod`, async () => {
    const configuration = await readConfiguration(relativePath);

    assert.equal(configuration.$schema, 'https://openapi.vercel.sh/vercel.json');
    assert.deepEqual(configuration.git?.deploymentEnabled, {
      'hetzner-prod': false,
    });
  });
}
