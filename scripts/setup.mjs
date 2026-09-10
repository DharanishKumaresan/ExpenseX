#!/usr/bin/env node
/**
 * One-command local setup.
 *
 *   npm run setup
 *
 * Creates .env with a generated SESSION_SECRET (if missing), starts the local
 * PostgreSQL cluster, applies migrations, generates the Prisma client and seeds
 * demo data. Safe to re-run: each step is skipped when already done, except the
 * seed, which only ever touches the two demo accounts.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)),
    );
  });
}

function step(message) {
  console.log(`\n[1m→ ${message}[0m`);
}

async function ensureEnv() {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    console.log('  .env already exists — leaving it alone');
    return;
  }

  const example = path.join(ROOT, '.env.example');
  if (!fs.existsSync(example)) throw new Error('.env.example is missing');

  const secret = crypto.randomBytes(48).toString('base64url');
  const contents = fs
    .readFileSync(example, 'utf8')
    .replace('replace-me-with-a-long-random-string-at-least-32-chars', secret);

  fs.writeFileSync(envPath, contents);
  console.log('  created .env with a freshly generated SESSION_SECRET');
}

async function main() {
  step('Checking environment');
  await ensureEnv();

  step('Starting local PostgreSQL');
  await run('node', ['scripts/pg.mjs', 'start']);

  step('Applying migrations');
  await run('npx', ['prisma', 'migrate', 'deploy']);

  step('Generating Prisma client');
  await run('npx', ['prisma', 'generate']);

  step('Seeding demo data');
  await run('node', ['--experimental-strip-types', 'prisma/seed.ts']);

  console.log('\n[1mReady.[0m Start the app with:  npm run dev\n');
}

main().catch((error) => {
  console.error(`\n[x] Setup failed: ${error.message}\n`);
  process.exit(1);
});
