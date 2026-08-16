#!/usr/bin/env node
/** Dry-run and re-apply Final B, proving stable Directus identities and counts. */

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BASELINE = resolve(HERE, '../lowen-baseline-a');
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const contract = JSON.parse(await readFile(resolve(BASELINE, 'contract/pearl-block-library.v1.json'), 'utf8'));
const mapping = JSON.parse(await readFile(resolve(BASELINE, 'migration/mapping-receipt.json'), 'utf8'));
if (!process.env.PEARL_PUBLIC_ASSET_FOLDER_ID) throw new Error('PEARL_PUBLIC_ASSET_FOLDER_ID is required');

async function request(path, token) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {Accept: 'application/json', Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GET ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 900)}`);
  return payload.data;
}

async function login() {
  if (process.env.DIRECTUS_ADMIN_TOKEN) return process.env.DIRECTUS_ADMIN_TOKEN;
  if (!process.env.DIRECTUS_ADMIN_EMAIL || !process.env.DIRECTUS_ADMIN_PASSWORD) throw new Error('Directus administrator credentials are required');
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: process.env.DIRECTUS_ADMIN_EMAIL, password: process.env.DIRECTUS_ADMIN_PASSWORD}),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Administrator login failed: ${response.status}`);
  return payload.data.access_token;
}

const token = await login();
const sortIds = rows => rows.map(row => row.id).sort();
async function snapshot() {
  const sites = await request('/items/pearl_sites?filter[slug][_eq]=lowen-perio&limit=-1&fields=id', token);
  const siteId = sites[0]?.id;
  const pages = siteId ? await request(`/items/pearl_pages?filter[site][_eq]=${siteId}&limit=-1&fields=id`, token) : [];
  const builders = siteId ? await request(`/items/pearl_page_builder?filter[page][site][_eq]=${siteId}&limit=-1&fields=id`, token) : [];
  const state = {sites: sortIds(sites), pages: sortIds(pages), builders: sortIds(builders), components: {}, nested: {}};
  state.navigation = siteId ? (await request(`/items/pearl_navigation_items?filter[site][_eq]=${siteId}&limit=-1&fields=id,parent`, token))
    .map(item => ({id: item.id, parent: typeof item.parent === 'object' ? item.parent?.id : item.parent || null}))
    .sort((left, right) => left.id.localeCompare(right.id)) : [];
  for (const spec of contract.blocks) {
    const parents = await request(`/items/${spec.collection}?filter[internal_name][_starts_with]=Lowen%20Final%20B%20%C2%B7%20&limit=-1&fields=id`, token);
    state.components[spec.collection] = sortIds(parents);
    if (spec.children) {
      const children = await request(`/items/${spec.children.collection}?filter[internal_name][_starts_with]=Lowen%20Final%20B%20%C2%B7%20&limit=-1&fields=id`, token);
      state.nested[spec.children.collection] = sortIds(children);
    }
  }
  state.forms = sortIds(await request('/items/pearl_forms?filter[internal_name][_starts_with]=Lowen%20Final%20B%20%C2%B7%20&limit=-1&fields=id', token));
  state.runs = sortIds(await request('/items/pearl_migration_runs?filter[internal_name][_eq]=Lowen%20Perio%20%C2%B7%20Baseline%20Final%20B&limit=-1&fields=id', token));
  const media = await request('/items/pearl_media_assets?filter[internal_name][_starts_with]=Lowen%20Final%20B%20%C2%B7%20&limit=-1&fields=id,file', token);
  state.media = sortIds(media);
  state.files = media.map(item => typeof item.file === 'object' ? item.file?.id : item.file).filter(Boolean).sort();
  return state;
}

const importer = resolve(BASELINE, 'scripts/import-to-directus.mjs');
const env = {...process.env, DIRECTUS_URL: BASE, PEARL_BASELINE: 'Final B', PEARL_RECEIPTS_DIR: resolve(HERE, 'receipts')};
const dry = spawnSync('node', [importer], {cwd: REPO, env, encoding: 'utf8', timeout: 60_000});
if (dry.status !== 0) throw new Error(`Final B dry-run failed: ${dry.error?.message || dry.stderr || dry.stdout}`);
const dryReceipt = JSON.parse(dry.stdout);
const before = await snapshot();
const apply = spawnSync('node', [importer, '--apply'], {cwd: REPO, env, encoding: 'utf8', timeout: 10 * 60_000});
if (apply.status !== 0) throw new Error(`Final B idempotent apply failed: ${apply.error?.message || apply.stderr || apply.stdout}`);
const after = await snapshot();
const stable = JSON.stringify(before) === JSON.stringify(after);
const receipt = {
  ok: dryReceipt.mode === 'dry-run' && dryReceipt.source_pages === 39 && dryReceipt.source_blocks === mapping.blocks && stable,
  generated_at: new Date().toISOString(),
  baseline: 'Final B',
  target: BASE,
  dry_run: dryReceipt,
  identity_snapshot_before: before,
  identity_snapshot_after: after,
  identities_stable: stable,
};
await mkdir(resolve(HERE, 'receipts'), {recursive: true});
await writeFile(resolve(HERE, 'receipts/import-idempotence.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ok: receipt.ok, dry_run: receipt.dry_run, identities_stable: receipt.identities_stable, pages: after.pages.length, builder_rows: after.builders.length, component_rows: Object.values(after.components).reduce((sum, ids) => sum + ids.length, 0), nested_rows: Object.values(after.nested).reduce((sum, ids) => sum + ids.length, 0), files: after.files.length}, null, 2));
if (!receipt.ok) process.exit(1);
