#!/usr/bin/env node
import {existsSync} from 'node:fs';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '../..');
const SITE = resolve(REPO, 'site');
const BASE = (process.env.PEARL_DIRECTUS_URL || 'https://pearl-poc-cms.foundryworks.ai').replace(/\/$/, '');
const token = process.env.PEARL_DIRECTUS_TOKEN;
if (!token) throw new Error('PEARL_DIRECTUS_TOKEN is required');

const normalized = JSON.parse(await readFile(resolve(ROOT, 'migration/normalized-pages.json'), 'utf8'));
const expectedHome = [
  'pearl_main_hero_standard', 'pearl_icon_feature_cards', 'pearl_feature_image_content',
  'pearl_icon_feature_cards', 'pearl_highlight_snippet_quote', 'pearl_feature_image_content',
  'pearl_contact_info_standard',
];

async function api(path) {
  const response = await fetch(`${BASE}${path}`, {headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
  return payload.data;
}

const library = await api('/items/pearl_block_library?limit=-1&fields=collection_name,status');
if (library.length !== 14 || library.some(item => item.status !== 'published')) throw new Error('Official Pearl block library failed');
const allowed = new Set(library.map(item => item.collection_name));
const pages = await api('/items/pearl_pages?filter[status][_eq]=published&filter[workflow_status][_eq]=approved&limit=-1&sort=slug&fields=id,slug,robots_index,robots_follow');
if (pages.length !== 26) throw new Error(`Expected 26 approved pages, received ${pages.length}`);
const rows = await api('/items/pearl_page_builder?limit=-1&sort=page,sort&fields=id,page,sort,collection,item');
if (rows.length !== 87) throw new Error(`Expected 87 Builder rows, received ${rows.length}`);

for (const page of pages) {
  if (page.robots_index !== false || page.robots_follow !== false) throw new Error(`Page is indexable: ${page.slug}`);
  const attached = rows.filter(row => row.page === page.id).sort((a, b) => Number(a.sort) - Number(b.sort));
  if (!attached.length || attached.some(row => !allowed.has(row.collection))) throw new Error(`Invalid Builder composition: ${page.slug}`);
  if (page.slug === 'home') {
    const actual = attached.map(row => row.collection);
    if (actual.join(',') !== expectedHome.join(',')) throw new Error(`Homepage is not frozen: ${actual.join(',')}`);
  }
}

const denied = await fetch(`${BASE}/items/directus_users`, {headers: {Authorization: `Bearer ${token}`}});
if (denied.status !== 403) throw new Error(`Build reader unexpectedly accessed users (${denied.status})`);

const missingRoutes = [];
const renderedHeadings = [];
for (const page of normalized) {
  const path = page.slug === 'home'
    ? resolve(SITE, 'dist/template-preview/pearl/index.html')
    : resolve(SITE, `dist/template-preview/pearl/${page.slug}/index.html`);
  if (!existsSync(path)) {
    missingRoutes.push(page.slug);
    continue;
  }
  const html = await readFile(path, 'utf8');
  if (!html.includes('noindex, nofollow')) throw new Error(`Rendered route is indexable: ${page.slug}`);
  if (!html.includes(page.h1.replaceAll('&', '&amp;')) && !html.includes(page.h1)) renderedHeadings.push(page.slug);
}
if (missingRoutes.length) throw new Error(`Missing rendered routes: ${missingRoutes.join(', ')}`);
if (renderedHeadings.length) throw new Error(`Source H1 missing from rendered routes: ${renderedHeadings.join(', ')}`);

const homeHtml = await readFile(resolve(SITE, 'dist/template-preview/pearl/index.html'), 'utf8');
const renderedHome = [...homeHtml.matchAll(/data-pearl-block="([^"]+)"/g)].map(match => `pearl_${match[1]}`);
if (renderedHome.join(',') !== expectedHome.join(',')) throw new Error(`Built homepage is not frozen: ${renderedHome.join(',')}`);
for (const expected of ['Carolina Comfort', 'Comfort by Name Comfort by Nature', '5511 Raeford Road']) {
  if (!homeHtml.includes(expected)) throw new Error(`Built homepage is missing source-backed value: ${expected}`);
}
if (!homeHtml.includes(`${BASE}/assets/`)) throw new Error('Built homepage does not use isolated POC assets');
if (homeHtml.includes('Dr. Amanda Pearl') || homeHtml.includes('WEO Media')) throw new Error('Golden placeholder content leaked into the POC');

const receipt = {
  ok: true,
  baseline: 'A',
  cms: BASE,
  official_blocks: library.length,
  approved_pages: pages.length,
  builder_rows: rows.length,
  homepage_frozen: true,
  rendered_routes: normalized.length,
  source_headings_present: normalized.length,
  build_reader_isolated: true,
  noindex: true,
};
await mkdir(resolve(ROOT, 'receipts'), {recursive: true});
await writeFile(resolve(ROOT, 'receipts/connected-build.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
