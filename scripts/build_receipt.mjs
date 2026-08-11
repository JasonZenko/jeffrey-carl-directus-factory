#!/usr/bin/env node
/** Machine-readable build receipt for the review site (site/dist). */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'site/dist');
const FROZEN = join(ROOT, 'site/src/content/frozen');

const pages = JSON.parse(readFileSync(join(FROZEN, 'pages.json'), 'utf8'));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(DIST);
const missing = pages.filter(
  (p) => !files.includes(join(DIST, p.legacy_path, 'index.html')));

const receipt = {
  generated_at: new Date().toISOString(),
  dist: 'site/dist',
  routes_expected: pages.length,
  routes_emitted: pages.length - missing.length,
  routes_missing: missing.map((p) => p.legacy_path),
  files: files.length,
  bytes: files.reduce((n, f) => n + statSync(f).size, 0),
  pages_sha256: createHash('sha256').update(readFileSync(join(FROZEN, 'pages.json'))).digest('hex'),
  noindex: {
    meta_robots: missing.length === 0 && pages.every((p) =>
      readFileSync(join(DIST, p.legacy_path, 'index.html'), 'utf8')
        .includes('<meta name="robots" content="noindex, nofollow"')),
    robots_txt: readFileSync(join(DIST, 'robots.txt'), 'utf8').includes('Disallow: /'),
    headers_file: files.includes(join(DIST, '_headers')),
  },
};

mkdirSync(join(ROOT, 'receipts'), { recursive: true });
writeFileSync(join(ROOT, 'receipts/build-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (receipt.routes_missing.length || !receipt.noindex.meta_robots) process.exit(1);
