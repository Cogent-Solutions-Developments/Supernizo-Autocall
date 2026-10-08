import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../../', import.meta.url));
const environmentFile = new URL('../../.env.development.local', import.meta.url);
const pnpm = fileURLToPath(new URL('../../node_modules/pnpm/bin/pnpm.cjs', import.meta.url));
const compose = ['compose', '-f', 'ops/docker/docker-compose.local.yml'];
const databasePrefix = 'postgresql://supernizo:supernizo-dev-password@127.0.0.1:15433/';
const localDatabase = databasePrefix + 'supernizo';
const command = process.argv[2];
const extra = process.argv.slice(3);

function execute(executable, args, environment = process.env) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw new Error('Could not start ' + executable + ': ' + result.error.code);
  if (result.status !== 0) throw new Error(executable + ' exited with status ' + result.status);
}

function task(args, environment) {
  execute(process.execPath, [pnpm, ...args], environment);
}

export async function initialize(
  file = environmentFile,
  example = new URL('../../.env.example', import.meta.url),
) {
  let template = await readFile(example, 'utf8');
  for (const key of ['AUTH_SECRET', 'TRACKING_IP_HASH_SECRET', 'LOCAL_ADMIN_PASSWORD']) {
    template = template.replace(
      new RegExp('^' + key + '=.*$', 'm'),
      key + '=' + randomBytes(32).toString('hex'),
    );
  }
  template = template.replace(/^GEOIP_DATABASE_PATH=.*$/m, 'GEOIP_DATABASE_PATH=');
  try {
    await writeFile(file, template, { flag: 'wx', mode: 0o600 });
    console.log(
      'Created .env.development.local with unique local secrets. Existing environment files were preserved.',
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log('Keeping the existing .env.development.local.');
  }
}

export async function environment(file = environmentFile, inherited = process.env) {
  const local = parse(await readFile(file));
  if (local.DATABASE_URL !== localDatabase) {
    throw new Error(
      'Local commands require the dedicated loopback database URL from .env.example.',
    );
  }
  return {
    ...inherited,
    ...local,
    // Never inherit an integration database or synchronization setting from another environment.
    BRIDGE_TEST_DATABASE_URL: '',
    SUPERNIZO_DIRECTORY_SYNC_ENABLED: 'false',
    SUPERNIZO_NOTIFICATION_SYNC_ENABLED: 'false',
  };
}

function prepareDatabases(env) {
  // Create test databases only when absent; never reset or drop existing data.
  for (const name of ['autocall_test', 'bridge_test']) {
    const sql =
      "SELECT 'CREATE DATABASE " +
      name +
      "' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '" +
      name +
      "')\\gexec";
    const result = spawnSync(
      'docker',
      [
        ...compose,
        'exec',
        '-T',
        'postgres',
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'supernizo',
        '-d',
        'supernizo',
      ],
      {
        cwd: root,
        env,
        input: sql + '\n',
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0)
      throw new Error(
        'Could not create the isolated local test databases. Check Docker Desktop and pnpm db:logs.',
      );
  }
  for (const name of ['supernizo', 'autocall_test', 'bridge_test']) {
    task(['prisma:deploy'], { ...env, DATABASE_URL: databasePrefix + name });
  }
}

async function main() {
  if (!['init', 'setup', 'dev', 'test', 'test:db', 'e2e', 'migrate'].includes(command)) {
    throw new Error(
      'Usage: node ops/development/local.mjs init|setup|dev|test|test:db|e2e|migrate',
    );
  }
  if (command === 'init' || command === 'setup') await initialize();
  if (command === 'init') return;
  const env = await environment();
  if (command === 'setup') {
    execute('docker', [...compose, 'up', '-d', '--wait', 'postgres'], env);
    task(['prisma:generate'], env);
    prepareDatabases(env);
    task(['prisma:seed'], env);
    task(['--filter', '@supernizo/shared', 'build'], env);
    task(['--filter', '@supernizo/tracker-sdk', 'build'], env);
    console.log(
      'Ready. Run pnpm dev:local. Sign in as admin@local.test using LOCAL_ADMIN_PASSWORD in .env.development.local.',
    );
  } else if (command === 'dev') {
    task(['dev', ...extra], env);
  } else if (command === 'migrate') {
    task(['prisma:migrate', ...extra], env);
  } else if (command === 'e2e') {
    task(['test:e2e', ...extra], { ...env, E2E_LOCAL_ADMIN_PASSWORD: env.LOCAL_ADMIN_PASSWORD });
  } else {
    task([command, ...extra], {
      ...env,
      DATABASE_URL: databasePrefix + 'autocall_test',
      BRIDGE_TEST_DATABASE_URL: databasePrefix + 'bridge_test',
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
