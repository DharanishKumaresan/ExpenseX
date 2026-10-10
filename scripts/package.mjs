#!/usr/bin/env node
/**
 * Builds the deployment bundle.
 *
 *   npm run package
 *
 * Produces dist/expensex-deploy.zip: the source tree plus the deploy configs,
 * without node_modules, without .next and without .env.
 *
 * WHY SOURCE AND NOT A PREBUILT .next
 * -----------------------------------
 * Prisma compiles a platform-specific query engine (query_engine-windows.dll.node
 * on Windows, libquery_engine-debian-openssl-3.0.x.so.node on a Hostinger VPS),
 * and Next traces native dependencies at build time. A .next folder built on one
 * platform will not run on the other. The bundle therefore carries the exact
 * lockfile and the build runs once on the server, where the right engine is
 * downloaded. It is one extra minute on deploy and it always works.
 */
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'expensex-deploy.zip');

/** Everything the server needs, and nothing it does not. */
const INCLUDE = [
  'src',
  'prisma',
  'public',
  'scripts',
  'deploy',
  'tests',
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'next-env.d.ts',
  'docker-compose.yml',
  '.env.example',
  '.gitignore',
  'README.md',
  'DEPLOY-HOSTINGER.md',
];

/** Never shipped: build output, dependencies, secrets, local caches. */
const EXCLUDE = new Set([
  'node_modules',
  '.next',
  '.git',
  '.env',
  'dist',
  '.pgdata',
  'tsconfig.tsbuildinfo',
  '.DS_Store',
  '.eslintcache',
]);

async function walk(absolute, relative, files) {
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE.has(entry.name)) continue;
    const childAbs = path.join(absolute, entry.name);
    const childRel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(childAbs, childRel, files);
    else if (entry.isFile()) files.push({ absolute: childAbs, name: childRel });
  }
}

/* -------------------------------------------------------------------------- */
/* A minimal ZIP writer.                                                       */
/* Deflate + the two central-directory structures, so the bundle needs no       */
/* dependency that a fresh checkout might not have installed yet.               */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** MS-DOS date/time, which is what the ZIP header stores. */
function dosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function writeZip(files, outFile) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());

  for (const file of files) {
    const raw = await fs.readFile(file.absolute);
    const deflated = deflateRawSync(raw, { level: 9 });
    // Storing is only smaller for already-compressed or tiny files.
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const nameBuffer = Buffer.from(file.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuffer, data);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(raw.length, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt32LE(0, 38); // external attributes
    header.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([header, nameBuffer]));

    offset += local.length + nameBuffer.length + data.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  const output = Buffer.concat([...chunks, directory, end]);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(outFile);
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(output);
  });
  return output;
}

async function main() {
  const files = [];

  for (const entry of INCLUDE) {
    const absolute = path.join(ROOT, entry);
    try {
      const stat = await fs.stat(absolute);
      if (stat.isDirectory()) await walk(absolute, entry, files);
      else files.push({ absolute, name: entry });
    } catch {
      console.warn(`  skipped (not found): ${entry}`);
    }
  }

  files.sort((a, b) => a.name.localeCompare(b.name));

  const zip = await writeZip(files, OUT_FILE);
  const digest = createHash('sha256').update(zip).digest('hex');

  const mb = (zip.length / 1024 / 1024).toFixed(2);
  console.log(`\n  dist/expensex-deploy.zip`);
  console.log(`  ${files.length} files · ${mb} MB`);
  console.log(`  sha256 ${digest}\n`);

  await fs.writeFile(
    path.join(OUT_DIR, 'expensex-deploy.zip.sha256'),
    `${digest}  expensex-deploy.zip\n`,
    'utf8',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
