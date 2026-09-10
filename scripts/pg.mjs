#!/usr/bin/env node
/**
 * Local development PostgreSQL controller.
 *
 * Drives the portable PostgreSQL binaries shipped by the `@embedded-postgres/*`
 * packages via `initdb` / `pg_ctl`, so the server runs detached and survives
 * between npm scripts. This is a zero-friction convenience for local dev only:
 * production points DATABASE_URL at a managed PostgreSQL instance, and
 * docker-compose.yml offers the container-based alternative.
 *
 * The cluster deliberately lives OUTSIDE the project directory. This repo may
 * sit inside a synced folder (OneDrive/Dropbox), and letting a sync client
 * touch a live PostgreSQL data directory causes churn and corruption.
 *
 *   node scripts/pg.mjs start|stop|status|url
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PG_PORT = Number(process.env.LOCAL_PG_PORT || 55432);
export const PG_USER = 'expensex';
export const PG_PASSWORD = 'expensex_dev';
export const PG_DATABASE = 'expensex';
export const DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DATABASE}?schema=public`;

/** Stable per-checkout directory under the OS app-data location. */
function dataDir() {
  if (process.env.LOCAL_PG_DATA) return path.resolve(process.env.LOCAL_PG_DATA);
  const base =
    os.platform() === 'win32'
      ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
      : path.join(os.homedir(), '.local', 'share');
  const fingerprint = crypto.createHash('sha1').update(ROOT).digest('hex').slice(0, 8);
  return path.join(base, 'expensex', `pgdata-${fingerprint}`);
}

const DATA_DIR = dataDir();
const LOG_FILE = path.join(DATA_DIR, 'server.log');

function binDir() {
  const platformPackage = {
    win32: { x64: '@embedded-postgres/windows-x64' },
    darwin: { x64: '@embedded-postgres/darwin-x64', arm64: '@embedded-postgres/darwin-arm64' },
    linux: { x64: '@embedded-postgres/linux-x64', arm64: '@embedded-postgres/linux-arm64' },
  }[os.platform()]?.[os.arch()];

  if (!platformPackage) {
    throw new Error(
      `No portable PostgreSQL build for ${os.platform()}/${os.arch()}.\n` +
        `  Run "docker compose up -d db" instead and point DATABASE_URL at it.`,
    );
  }

  // These packages hide ./package.json behind `exports`, so locate the install
  // directory directly and fall back to walking up from the resolved entry.
  const direct = path.join(ROOT, 'node_modules', ...platformPackage.split('/'), 'native', 'bin');
  if (fs.existsSync(direct)) return direct;

  let dir = path.dirname(require.resolve(platformPackage));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, 'native', 'bin');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error(
    `PostgreSQL binaries missing from ${platformPackage}.\n` +
      `  Run "npm install" (and approve its install script) to download them.`,
  );
}

const exe = (name) => path.join(binDir(), os.platform() === 'win32' ? `${name}.exe` : name);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Promise-based exec that never hangs the caller.
 *
 * Resolves on 'exit' rather than 'close': `pg_ctl start` leaves the detached
 * postmaster holding the inherited stdio pipes, so 'close' would never fire
 * even though pg_ctl itself has long since exited.
 */
function run(cmd, args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    const finish = (code) => {
      clearTimeout(timer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      resolve({ code, out: out.trim() });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(-1);
    }, timeout);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (err) => {
      out += err.message;
      finish(-1);
    });
    child.on('exit', (code) => finish(code));
  });
}

export async function isRunning() {
  if (!fs.existsSync(path.join(DATA_DIR, 'postmaster.pid'))) return false;
  const { code } = await run(exe('pg_ctl'), ['status', '-D', DATA_DIR], { timeout: 15000 });
  return code === 0;
}

async function initialise() {
  if (fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) return;
  console.log(`· initialising cluster at ${DATA_DIR}`);
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const pwFile = path.join(os.tmpdir(), `expensex-pw-${process.pid}`);
  fs.writeFileSync(pwFile, PG_PASSWORD, { mode: 0o600 });
  try {
    const { code, out } = await run(
      exe('initdb'),
      [
        '-D', DATA_DIR,
        '-U', PG_USER,
        '--auth-local=scram-sha-256',
        '--auth-host=scram-sha-256',
        `--pwfile=${pwFile}`,
        '--encoding=UTF8',
        '--no-sync',
      ],
      { timeout: 180000 },
    );
    if (code !== 0) throw new Error(`initdb failed:\n${out}`);
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
}

/** Open a TCP connection to confirm the postmaster is accepting sockets. */
function canConnect(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function ensureDatabase() {
  const { Client } = require('pg');
  const client = new Client({
    host: '127.0.0.1',
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: 'postgres',
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [PG_DATABASE]);
    if (rowCount === 0) {
      await client.query(`create database "${PG_DATABASE}"`);
      console.log(`· created database "${PG_DATABASE}"`);
    }
  } finally {
    await client.end();
  }
}

async function start() {
  if (await isRunning()) {
    console.log(`· postgres already running on port ${PG_PORT}`);
  } else {
    await initialise();
    console.log(`· starting postgres on port ${PG_PORT}`);
    const { code, out } = await run(
      exe('pg_ctl'),
      [
        'start',
        '-D', DATA_DIR,
        '-l', LOG_FILE,
        '-o', `-p ${PG_PORT} -c listen_addresses=127.0.0.1`,
        '-w',
        '-t', '45',
      ],
      { timeout: 90000 },
    );

    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
      ready = await canConnect(PG_PORT);
      if (!ready) await sleep(500);
    }
    if (!ready) {
      const log = fs.existsSync(LOG_FILE)
        ? fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-15).join('\n')
        : '';
      throw new Error(`postgres did not become ready (pg_ctl exit ${code})\n${out}\n${log}`);
    }
  }

  await ensureDatabase();
  console.log(`· ready -> ${DATABASE_URL}`);
}

async function stop() {
  if (!(await isRunning())) {
    console.log('· postgres is not running');
    return;
  }
  const { code, out } = await run(exe('pg_ctl'), ['stop', '-D', DATA_DIR, '-m', 'fast', '-w'], {
    timeout: 60000,
  });
  console.log(code === 0 ? '· postgres stopped' : `· stop failed:\n${out}`);
}

const command = process.argv[2] || 'start';
try {
  if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else if (command === 'status') console.log((await isRunning()) ? 'running' : 'stopped');
  else if (command === 'url') console.log(DATABASE_URL);
  else throw new Error(`unknown command "${command}" (use start|stop|status|url)`);
  process.exit(0);
} catch (error) {
  console.error(`\n[x] ${error.message}\n`);
  process.exit(1);
}
