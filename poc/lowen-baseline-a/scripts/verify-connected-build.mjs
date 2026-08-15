#!/usr/bin/env node
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '../..');
const SITE = resolve(REPO, 'site');
const BASELINE = process.env.PEARL_BASELINE || 'A';
const RECEIPTS_DIR = resolve(process.env.PEARL_RECEIPTS_DIR || resolve(ROOT, 'receipts'));
const BASE = (process.env.PEARL_DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const token = process.env.PEARL_DIRECTUS_TOKEN;
if (!token) throw new Error('PEARL_DIRECTUS_TOKEN is required');

const normalized = JSON.parse(await readFile(resolve(ROOT, 'migration/pages.json'), 'utf8'));
const mapping = JSON.parse(await readFile(resolve(ROOT, 'migration/mapping-receipt.json'), 'utf8'));
const siteContract = JSON.parse(await readFile(resolve(ROOT, 'migration/site.json'), 'utf8'));
const expectedHome = mapping.homepage_sequence.map(type => `pearl_${type}`);
const expectedNavigation = [...siteContract.navigation].sort((a, b) => Number(a.sort) - Number(b.sort));

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
if (pages.length !== normalized.length) throw new Error(`Expected ${normalized.length} approved pages, received ${pages.length}`);
const rows = await api('/items/pearl_page_builder?limit=-1&sort=page,sort&fields=id,page,sort,collection,item');
if (rows.length !== mapping.blocks) throw new Error(`Expected ${mapping.blocks} Builder rows, received ${rows.length}`);
const sites = await api('/items/pearl_sites?filter[slug][_eq]=lowen-perio&limit=1&fields=id');
if (!sites[0]) throw new Error('Lowen site identity is missing');
const navigation = await api(`/items/pearl_navigation_items?filter[site][_eq]=${sites[0].id}&filter[status][_eq]=published&limit=-1&sort=sort&fields=label,url,sort`);
if (navigation.length !== mapping.navigation_items) throw new Error(`Expected ${mapping.navigation_items} navigation items, received ${navigation.length}`);
if (JSON.stringify(navigation) !== JSON.stringify(expectedNavigation)) {
  throw new Error(`Navigation diverged from the frozen source: ${JSON.stringify(navigation)}`);
}

for (const page of pages) {
  if (page.robots_index !== false || page.robots_follow !== false) throw new Error(`Page is indexable: ${page.slug}`);
  const attached = rows.filter(row => row.page === page.id).sort((a, b) => Number(a.sort) - Number(b.sort));
  if (!attached.length || attached.some(row => !allowed.has(row.collection))) throw new Error(`Invalid Builder composition: ${page.slug}`);
  if (page.slug === 'home' && attached.map(row => row.collection).join(',') !== expectedHome.join(',')) {
    throw new Error(`Homepage diverged from the source object map: ${attached.map(row => row.collection).join(',')}`);
  }
}

const denied = await fetch(`${BASE}/users`, {headers: {Authorization: `Bearer ${token}`}});
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
  const heading = page.blocks.find(block => block.type === 'inner_hero_standard')?.item?.page_title
    || page.blocks.find(block => block.type === 'main_hero_standard')?.item?.heading;
  if (heading && !html.includes(heading.replaceAll('&', '&amp;')) && !html.includes(heading)) renderedHeadings.push(page.slug);
}
if (missingRoutes.length) throw new Error(`Missing rendered routes: ${missingRoutes.join(', ')}`);
if (renderedHeadings.length) throw new Error(`Source heading missing from rendered routes: ${renderedHeadings.join(', ')}`);

const homeHtml = await readFile(resolve(SITE, 'dist/template-preview/pearl/index.html'), 'utf8');
const renderedHome = [...homeHtml.matchAll(/data-pearl-block="([^"]+)"/g)].map(match => `pearl_${match[1]}`);
if (renderedHome.join(',') !== expectedHome.join(',')) throw new Error(`Built homepage diverged from source object map: ${renderedHome.join(',')}`);
for (const expected of ['Lowen Perio', 'Dr. Krista Lowen', 'Dr. Lillian Nguyen']) {
  if (!homeHtml.includes(expected)) throw new Error(`Built homepage is missing source-backed value: ${expected}`);
}
if (!homeHtml.includes(`${BASE}/assets/`)) throw new Error('Built homepage does not use isolated Lowen assets');
if (homeHtml.includes('Dr. Amanda Pearl') || homeHtml.includes('Carolina Comfort')) throw new Error('Prior POC content leaked into Lowen');
if (homeHtml.match(/<nav id="pearl-primary-navigation"[\s\S]*?<\/nav>/)?.[0].includes('href="#')) {
  throw new Error('Primary navigation still contains target-shell anchors');
}
const renderedNavigation = [...(homeHtml.match(/<nav id="pearl-primary-navigation"[\s\S]*?<\/nav>/)?.[0] || '').matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
  .map(match => ({url: match[1], label: match[2]}));
if (JSON.stringify(renderedNavigation) !== JSON.stringify(expectedNavigation.map(({label, url}) => ({url, label})))) {
  throw new Error(`Rendered navigation diverged from the frozen source: ${JSON.stringify(renderedNavigation)}`);
}

const receipt = {
  ok: true,
  baseline: BASELINE,
  cms: BASE,
  official_blocks: library.length,
  approved_pages: pages.length,
  builder_rows: rows.length,
  navigation_items: navigation.length,
  homepage_source_derived: true,
  rendered_routes: normalized.length,
  source_headings_present: normalized.length,
  build_reader_isolated: true,
  noindex: true,
};
await mkdir(RECEIPTS_DIR, {recursive: true});
await writeFile(resolve(RECEIPTS_DIR, 'connected-build.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
