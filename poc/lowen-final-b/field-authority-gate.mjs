#!/usr/bin/env node
/** Prove every used Pearl parent/nested family is authoritative from Directus. */

import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SITE = resolve(REPO, 'site');
const DIST = resolve(SITE, 'dist');
const BASELINE = resolve(HERE, '../lowen-baseline-a');
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const BUILD_TOKEN = process.env.PEARL_DIRECTUS_TOKEN;
if (!BUILD_TOKEN) throw new Error('PEARL_DIRECTUS_TOKEN is required');

const pages = JSON.parse(await readFile(resolve(BASELINE, 'migration/pages.json'), 'utf8'));
const contract = JSON.parse(await readFile(resolve(BASELINE, 'contract/pearl-block-library.v1.json'), 'utf8'));
const mutationFields = {
  pearl_inner_hero_standard: 'page_title',
  pearl_flex_content_section: 'section_header',
  pearl_highlight_links: 'section_heading',
  pearl_highlight_link_items: 'link_label',
  pearl_cta_section_standard: 'heading',
  pearl_main_hero_standard: 'heading',
  pearl_icon_feature_cards: 'section_heading',
  pearl_feature_image_content: 'heading',
  pearl_highlight_snippet_quote: 'snippet',
  pearl_testimonial_list_standard: 'section_heading',
  pearl_contact_info_standard: 'heading',
  pearl_icon_feature_card_items: 'link_title',
  pearl_testimonial_items: 'patient_name',
};

async function request(path, token, {method = 'GET', body} = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 900)}`);
  return payload.data;
}

async function login() {
  if (process.env.DIRECTUS_ADMIN_TOKEN) return process.env.DIRECTUS_ADMIN_TOKEN;
  if (!process.env.DIRECTUS_ADMIN_EMAIL || !process.env.DIRECTUS_ADMIN_PASSWORD) throw new Error('Directus administrator credentials are required');
  const response = await fetch(`${BASE}/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: process.env.DIRECTUS_ADMIN_EMAIL, password: process.env.DIRECTUS_ADMIN_PASSWORD})});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Administrator login failed: ${response.status}`);
  return payload.data.access_token;
}

const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const cleanPath = slug => resolve(DIST, slug === 'home' ? 'index.html' : `${slug}/index.html`);
const templatePath = slug => resolve(DIST, slug === 'home' ? 'template-preview/pearl/index.html' : `template-preview/pearl/${slug}/index.html`);
const routeFiles = () => pages.flatMap(page => [cleanPath(page.slug), templatePath(page.slug)]);

async function copyPearlHome() {
  await copyFile(templatePath('home'), cleanPath('home'));
}

async function build(label) {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: SITE,
    stdio: 'inherit',
    env: {...process.env, PEARL_CONTENT_MODE: 'connected', PEARL_DIRECTUS_URL: BASE, PEARL_DIRECTUS_TOKEN: BUILD_TOKEN},
  });
  if (result.status !== 0) throw new Error(`${label} connected build failed with status ${result.status}`);
  await copyPearlHome();
}

async function routeHashes() {
  const hashes = {};
  for (const file of routeFiles()) hashes[file.slice(DIST.length + 1)] = sha(await readFile(file));
  return hashes;
}

const adminToken = await login();
const used = new Set(pages.flatMap(page => page.blocks.map(block => contract.blocks.find(spec => spec.key === block.type)?.collection)).filter(Boolean));
const usedSpecs = contract.blocks.filter(spec => used.has(spec.collection));
const scopedFields = usedSpecs.flatMap(spec => [`item:${spec.collection}.*`, ...(spec.children ? [`item:${spec.collection}.${spec.children.alias}.*`] : [])]);
const rows = await request(`/items/pearl_page_builder?filter[page][site][slug][_eq]=lowen-perio&limit=-1&sort=page,sort&fields=${['id', 'page.slug', 'sort', 'collection', ...scopedFields].join(',')}`, BUILD_TOKEN);

const mutations = [];
for (const spec of usedSpecs) {
  const field = mutationFields[spec.collection];
  if (!field) throw new Error(`No field-authority target configured for ${spec.collection}`);
  const candidates = rows.filter(row => row.collection === spec.collection && row.item?.id);
  const row = candidates.find(candidate => String(candidate.item[field] || '').trim()) || candidates[0];
  if (!row) throw new Error(`No ${spec.collection} record is attached to a Lowen page`);
  mutations.push({family: spec.collection, collection: spec.collection, id: row.item.id, page: row.page.slug, field, original: row.item[field] ?? null});
  if (spec.children) {
    const childField = mutationFields[spec.children.collection];
    if (!childField) throw new Error(`No field-authority target configured for ${spec.children.collection}`);
    const children = candidates.flatMap(candidate => (candidate.item[spec.children.alias] || []).map(child => ({child, page: candidate.page.slug})));
    const selected = children.find(({child}) => String(child[childField] || '').trim()) || children[0];
    if (!selected) throw new Error(`No ${spec.children.collection} record is attached to a Lowen page`);
    mutations.push({family: spec.children.collection, collection: spec.children.collection, id: selected.child.id, page: selected.page, field: childField, original: selected.child[childField] ?? null});
  }
}

const receipt = {ok: false, baseline: 'Final B', cms: BASE, families: mutations.length, mutations: [], baseline_route_hashes: {}, restored_route_hashes: {}, failures: []};
let mutationBuildComplete = false;
await build('baseline');
receipt.baseline_route_hashes = await routeHashes();

try {
  for (const [index, mutation] of mutations.entries()) {
    mutation.marker = `FINAL_B_AUTH_${String(index + 1).padStart(2, '0')}_${mutation.family.toUpperCase()}`;
    await request(`/items/${mutation.collection}/${mutation.id}`, adminToken, {method: 'PATCH', body: {[mutation.field]: mutation.marker}});
    receipt.mutations.push({family: mutation.family, collection: mutation.collection, id: mutation.id, page: mutation.page, field: mutation.field, original_sha256: sha(mutation.original), marker: mutation.marker});
  }
  await build('mutation');
  mutationBuildComplete = true;
  const files = routeFiles();
  const htmlByFile = new Map(await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')])));
  for (const mutation of mutations) {
    const present = files.filter(file => htmlByFile.get(file).includes(mutation.marker));
    const expected = [cleanPath(mutation.page), templatePath(mutation.page)].sort();
    const actual = present.sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${mutation.family} marker appeared in ${actual.length} routes instead of its clean/template page pair`);
    }
  }
} catch (error) {
  receipt.failures.push(String(error?.stack || error));
} finally {
  for (const mutation of mutations) {
    await request(`/items/${mutation.collection}/${mutation.id}`, adminToken, {method: 'PATCH', body: {[mutation.field]: mutation.original}});
  }
  await build('restoration');
}

for (const mutation of mutations) {
  const restored = await request(`/items/${mutation.collection}/${mutation.id}?fields=id,${mutation.field}`, adminToken);
  if (sha(restored[mutation.field] ?? null) !== sha(mutation.original)) receipt.failures.push(`${mutation.family}.${mutation.field} did not restore exactly`);
}
const restoredHtml = await Promise.all(routeFiles().map(file => readFile(file, 'utf8')));
for (const mutation of mutations) {
  if (restoredHtml.some(html => html.includes(mutation.marker))) receipt.failures.push(`${mutation.family} marker remained after restoration`);
}
receipt.restored_route_hashes = await routeHashes();
if (JSON.stringify(receipt.restored_route_hashes) !== JSON.stringify(receipt.baseline_route_hashes)) receipt.failures.push('restored route hashes differ from the pre-mutation connected build');
receipt.mutation_build_complete = mutationBuildComplete;
receipt.restored_exactly = receipt.failures.length === 0;
receipt.marker_absent_after_restore = !restoredHtml.some(html => html.includes('FINAL_B_AUTH_'));
receipt.ok = receipt.mutation_build_complete && receipt.restored_exactly && receipt.marker_absent_after_restore;
await mkdir(resolve(HERE, 'receipts'), {recursive: true});
await writeFile(resolve(HERE, 'receipts/field-authority.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({...receipt, baseline_route_hashes: {count: Object.keys(receipt.baseline_route_hashes).length}, restored_route_hashes: {count: Object.keys(receipt.restored_route_hashes).length}}, null, 2));
if (!receipt.ok) process.exit(1);
