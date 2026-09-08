import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

test('Nginx serves the canonical Next.js root without a trailing-slash loop', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'autocall-nginx-'));
  const name = `autocall-routing-test-${process.pid}`;
  let started = false;
  const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
  try {
    // Model Next.js's default slash normalization behind the real Nginx snippet.
    writeFileSync(
      join(directory, 'nginx.conf'),
      `events {}
http {
  server {
    listen 127.0.0.1:3200;
    location = /autocall-db/ { return 308 /autocall-db; }
    location / { return 200 'upstream'; }
  }
  server {
    listen 8080;
    # The production HTTP-level GeoIP include defines these values. Stub them
    # here so this stock Nginx image can validate the route snippet without
    # requiring the optional GeoIP2 module or database.
    set $autocall_geo_city "";
    set $autocall_geo_country "";
    set $autocall_geo_region "";
    include /etc/nginx/autocall.conf;
    location / { return 200 'leadgen'; }
  }
}
`,
    );
    docker(
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--publish',
      '127.0.0.1::8080',
      '--mount',
      `type=bind,source=${join(directory, 'nginx.conf')},target=/etc/nginx/nginx.conf,readonly`,
      '--mount',
      `type=bind,source=${resolve('ops/nginx/autocall.location.conf')},target=/etc/nginx/autocall.conf,readonly`,
      'nginx:1.24-alpine',
    );
    started = true;
    docker('exec', name, 'nginx', '-t');
    const port = docker('port', name, '8080/tcp').split(':').at(-1);
    const base = `http://127.0.0.1:${port}`;
    const request = (path) =>
      fetch(`${base}${path}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
    for (const path of ['/autocall-db', '/autocall-db/login', '/autocall-db/api/health/ready']) {
      const response = await request(path);
      assert.equal(response.status, 200, `${path} must reach Next.js without a redirect`);
      assert.equal(await response.text(), 'upstream');
    }
    const slash = await request('/autocall-db/');
    assert.equal(slash.status, 308);
    assert.equal(new URL(slash.headers.get('location'), base).pathname, '/autocall-db');
    for (const path of ['/', '/autocall-db-other']) {
      assert.equal(await (await request(path)).text(), 'leadgen');
    }
  } finally {
    if (started) docker('stop', name);
    rmSync(directory, { recursive: true, force: true });
  }
});
