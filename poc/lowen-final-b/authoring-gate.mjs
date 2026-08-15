#!/usr/bin/env node
/** Final B authoring-model and isolated build-reader acceptance gate. */

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = resolve(HERE, '../lowen-baseline-a');
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const BUILD_TOKEN = process.env.PEARL_DIRECTUS_TOKEN;
if (!BUILD_TOKEN) throw new Error('PEARL_DIRECTUS_TOKEN is required');
const pagesSource = JSON.parse(await readFile(resolve(BASELINE, 'migration/pages.json'), 'utf8'));
const mapping = JSON.parse(await readFile(resolve(BASELINE, 'migration/mapping-receipt.json'), 'utf8'));
const contract = JSON.parse(await readFile(resolve(BASELINE, 'contract/pearl-block-library.v1.json'), 'utf8'));

async function request(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {method: options.method || 'GET', headers: {Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.body ? {'Content-Type': 'application/json'} : {})}, body: options.body ? JSON.stringify(options.body) : undefined});
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 900)}`);
  return payload.data;
}

async function login(email, password) {
  if (!email || !password) throw new Error('Administrator credentials are required for the authoring gate');
  const response = await fetch(`${BASE}/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password})});
  const payload = await response.json();
  if (!response.ok) throw new Error(`Administrator login failed: ${response.status}`);
  return payload.data.access_token;
}

const adminToken = process.env.DIRECTUS_ADMIN_TOKEN || await login(process.env.DIRECTUS_ADMIN_EMAIL, process.env.DIRECTUS_ADMIN_PASSWORD);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const stableObject = value => Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
const sites = await request('/items/pearl_sites?filter[slug][_eq]=lowen-perio&limit=-1&fields=id,slug,internal_name', BUILD_TOKEN);
check(sites.length === 1, `expected one Lowen site, received ${sites.length}`);
const site = sites[0];
if (!site) throw new Error(failures.join('; '));
const pages = await request(`/items/pearl_pages?filter[site][_eq]=${site.id}&limit=-1&sort=slug&fields=id,slug,status,workflow_status,robots_index,robots_follow`, BUILD_TOKEN);
check(pages.length === 39, `expected 39 Lowen pages, received ${pages.length}`);
check(new Set(pages.map(page => page.slug)).size === 39, 'page slugs are not unique');
check(pages.every(page => page.status === 'published' && page.workflow_status === 'approved' && page.robots_index === false && page.robots_follow === false), 'all Lowen pages must be approved, published and noindex/nofollow');

const scopedFields = contract.blocks.flatMap(spec => {
  const values = [`item:${spec.collection}.*`];
  if (spec.children) values.push(`item:${spec.collection}.${spec.children.alias}.*`);
  return values;
});
const builderFields = ['id', 'page.id', 'page.slug', 'sort', 'collection', ...scopedFields].join(',');
const rows = await request(`/items/pearl_page_builder?filter[page][site][_eq]=${site.id}&limit=-1&sort=page,sort&fields=${builderFields}`, BUILD_TOKEN);
check(rows.length === mapping.blocks, `expected ${mapping.blocks} Builder rows, received ${rows.length}`);
check(rows.every(row => row.item && typeof row.item === 'object' && row.item.id), 'build reader did not resolve every Builder item');

const expectedCounts = {};
const expectedNested = {};
for (const page of pagesSource) {
  for (const block of page.blocks) {
    const spec = contract.blocks.find(item => item.key === block.type);
    expectedCounts[spec.collection] = (expectedCounts[spec.collection] || 0) + 1;
    if (spec.children) expectedNested[spec.children.collection] = (expectedNested[spec.children.collection] || 0) + (block.item[spec.children.alias]?.length || 0);
  }
}
const actualCounts = {};
const actualNested = {};
for (const row of rows) {
  actualCounts[row.collection] = (actualCounts[row.collection] || 0) + 1;
  const spec = contract.blocks.find(item => item.collection === row.collection);
  if (spec?.children) actualNested[spec.children.collection] = (actualNested[spec.children.collection] || 0) + (row.item[spec.children.alias]?.length || 0);
}
check(JSON.stringify(stableObject(actualCounts)) === JSON.stringify(stableObject(expectedCounts)), `semantic component distribution mismatch: ${JSON.stringify(actualCounts)}`);
check(JSON.stringify(stableObject(actualNested)) === JSON.stringify(stableObject(expectedNested)), `nested item distribution mismatch: ${JSON.stringify(actualNested)}`);

const pageRowCounts = new Map();
for (const row of rows) pageRowCounts.set(row.page.slug, (pageRowCounts.get(row.page.slug) || 0) + 1);
check([...pageRowCounts.entries()].every(([slug, count]) => count === pagesSource.find(page => page.slug === slug).blocks.length), 'one or more page Builder counts diverged from the source map');
check([...pageRowCounts.entries()].filter(([slug, count]) => slug !== 'home' && count < 2).length === 0, 'one or more inner pages collapsed into a single block');

const orphanEvidence = {};
for (const [collection, expected] of Object.entries(expectedCounts)) {
  const finalRows = await request(`/items/${collection}?filter[internal_name][_starts_with]=Lowen%20Final%20B%20%C2%B7%20&limit=-1&fields=id,internal_name`, BUILD_TOKEN);
  const allLowenRows = await request(`/items/${collection}?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name`, BUILD_TOKEN);
  const staleRows = allLowenRows.filter(row => !row.internal_name?.startsWith('Lowen Final B · '));
  orphanEvidence[collection] = {attached: actualCounts[collection], final_records: finalRows.length, all_lowen_records: allLowenRows.length, stale_records: staleRows.length};
  check(finalRows.length === expected, `${collection} has ${finalRows.length} Final B records, expected ${expected}`);
  check(staleRows.length === 0, `${collection} still contains stale pre-Final-B records`);
}

const collections = new Map((await request('/collections', adminToken)).map(item => [item.collection, item]));
check(collections.get('pearl_pages')?.meta?.hidden === false, 'Pearl Pages must be visible to editors');
check(collections.get('pearl_page_builder')?.meta?.hidden === true, 'Builder junction must remain hidden from editors');
for (const collection of Object.keys(expectedCounts)) check(collections.get(collection)?.meta?.hidden === false, `${collection} must be visible to editors`);
const pageFields = new Map((await request('/fields/pearl_pages', adminToken)).map(item => [item.field, item]));
check(pageFields.get('blocks')?.meta?.special?.includes('m2a'), 'Pearl Pages.blocks must be the native M2A Builder');
check(pageFields.get('blocks')?.meta?.hidden === false, 'Pearl Pages.blocks must be visible');
for (const spec of contract.blocks.filter(item => expectedCounts[item.collection])) {
  const fields = new Map((await request(`/fields/${spec.collection}`, adminToken)).map(item => [item.field, item]));
  for (const field of spec.fields) {
    check(fields.has(field.name), `${spec.collection}.${field.name} is missing`);
    if (field.interface) check(fields.get(field.name)?.meta?.interface === field.interface, `${spec.collection}.${field.name} editor interface drift`);
  }
}

const forms = await request('/items/pearl_forms?filter[internal_name][_starts_with]=Lowen%20Final%20B%20%C2%B7%20&limit=-1&fields=id,provider,embed_url,status', adminToken);
check(forms.length === 2 && forms.every(form => form.status === 'published' && form.embed_url), `expected two governed provider embed records, received ${forms.length}`);
const runs = await request('/items/pearl_migration_runs?filter[internal_name][_eq]=Lowen%20Perio%20%C2%B7%20Baseline%20Final%20B&limit=-1&fields=id,summary,status', adminToken);
check(runs.length === 1 && runs[0].summary?.exceptions === 3, 'Final B migration receipt does not retain all three provider exceptions');

const denied = await fetch(`${BASE}/users`, {headers: {Authorization: `Bearer ${BUILD_TOKEN}`}});
check(denied.status === 403, `build reader unexpectedly accessed users (${denied.status})`);
if (process.env.DOM_ADMIN_EMAIL && process.env.DOM_ADMIN_PASSWORD) {
  await login(process.env.DOM_ADMIN_EMAIL, process.env.DOM_ADMIN_PASSWORD);
}

const receipt = {ok: failures.length === 0, baseline: 'Final B', cms: BASE, sites: sites.length, pages: pages.length, builder_rows: rows.length, component_counts: actualCounts, nested_counts: actualNested, page_builder_counts: Object.fromEntries(pageRowCounts), orphan_evidence: orphanEvidence, provider_records: forms.length, provider_exceptions: runs[0]?.summary?.exceptions, build_reader_isolated: denied.status === 403, dom_admin_login_verified: Boolean(process.env.DOM_ADMIN_EMAIL && process.env.DOM_ADMIN_PASSWORD), failures};
await mkdir(resolve(HERE, 'receipts'), {recursive: true});
await writeFile(resolve(HERE, 'receipts/authoring-gate.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (failures.length) process.exit(1);
