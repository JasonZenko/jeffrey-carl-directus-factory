#!/usr/bin/env node
/** Prove the pre-feedback state is recoverable and reviewed Final B is the sole live state. */

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECEIPTS = resolve(HERE, 'receipts');
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const backup = JSON.parse(await readFile(resolve(RECEIPTS, 'backup-restore-receipt.json'), 'utf8'));
const imported = JSON.parse(await readFile(resolve(RECEIPTS, 'directus-import.json'), 'utf8'));
const authoring = JSON.parse(await readFile(resolve(RECEIPTS, 'authoring-gate.json'), 'utf8'));
const purged = JSON.parse(await readFile(resolve(RECEIPTS, 'stale-component-purge.json'), 'utf8'));

async function request(path, token) {
  const response = await fetch(`${BASE}${path}`, {headers: {Accept: 'application/json', Authorization: `Bearer ${token}`}});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GET ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 900)}`);
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

const token = await login();
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
check(backup.ok && backup.temporary_database_restore_verified, 'pre-feedback rollback backup lacks restoration proof');
check(backup.source_counts.pearl_pages === 39 && backup.source_counts.pearl_page_builder > 0, 'rollback backup does not identify the 39-page pre-feedback review state');
check(purged.ok && Object.values(purged.after).every(count => count === 0), 'unattached Lowen component purge is incomplete');
check(imported.ok && authoring.ok, 'Final B import/authoring receipts are not green');

const sites = await request('/items/pearl_sites?filter[slug][_eq]=lowen-perio&limit=-1&fields=id,slug,internal_name', token);
check(sites.length === 1, `expected one live Lowen site, received ${sites.length}`);
const site = sites[0];
check(site?.internal_name === 'Lowen Perio · Baseline Final B', `live site is not labelled Final B: ${site?.internal_name}`);
const pages = site ? await request(`/items/pearl_pages?filter[site][_eq]=${site.id}&limit=-1&fields=id,slug,internal_name`, token) : [];
const builders = site ? await request(`/items/pearl_page_builder?filter[page][site][_eq]=${site.id}&limit=-1&fields=id,page,collection,item`, token) : [];
check(pages.length === 39 && new Set(pages.map(page => page.slug)).size === 39, `live Final B page state is ${pages.length}/39 or contains duplicate slugs`);
check(builders.length === imported.imported_blocks, `live Final B Builder state is ${builders.length}/${imported.imported_blocks}`);

const componentEvidence = {};
for (const [collection, expected] of Object.entries(authoring.component_counts)) {
  const allLowen = await request(`/items/${collection}?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name`, token);
  const stale = allLowen.filter(item => item.internal_name?.startsWith('Lowen B'));
  const final = allLowen.filter(item => item.internal_name?.startsWith('Lowen Final B · '));
  componentEvidence[collection] = {all_lowen: allLowen.length, final_b: final.length, stale_b_or_b2: stale.length};
  check(allLowen.length === expected && final.length === expected && stale.length === 0, `${collection} is not Final-B-only`);
}

const forms = await request('/items/pearl_forms?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name', token);
const runs = await request('/items/pearl_migration_runs?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name', token);
const media = await request('/items/pearl_media_assets?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name,file', token);
check(forms.length === 2 && forms.every(item => item.internal_name.startsWith('Lowen Final B · ')), 'provider records are not Final-B-only');
check(runs.length === 1 && runs[0].internal_name === 'Lowen Perio · Baseline Final B', 'migration-run records are not Final-B-only');
check(media.length === imported.uploaded_assets, `live Lowen media state is ${media.length}/${imported.uploaded_assets}`);
check(new Set(media.map(item => typeof item.file === 'object' ? item.file?.id : item.file)).size === imported.uploaded_assets, 'live Lowen media does not resolve to one unique file per frozen asset');

const receipt = {
  ok: failures.length === 0,
  generated_at: new Date().toISOString(),
  target: BASE,
  pre_feedback_backup: {
    recoverable: backup.temporary_database_restore_verified,
    backup_dir: backup.backup_dir,
    database_dump_sha256: backup.database_dump_sha256,
    pages: backup.source_counts.pearl_pages,
    builder_rows: backup.source_counts.pearl_page_builder,
  },
  unattached_lowen_components_removed: Object.values(purged.selected).reduce((sum, count) => sum + count, 0),
  final_b_live: {sites: sites.length, pages: pages.length, builder_rows: builders.length, components: Object.values(authoring.component_counts).reduce((sum, count) => sum + count, 0), forms: forms.length, migration_runs: runs.length, media_assets: media.length},
  component_evidence: componentEvidence,
  failures,
};
await mkdir(RECEIPTS, {recursive: true});
await writeFile(resolve(RECEIPTS, 'final-state-proof.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (failures.length) process.exit(1);
