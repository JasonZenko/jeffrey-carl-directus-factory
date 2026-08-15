#!/usr/bin/env node
/** Inventory, then remove only Lowen-owned records from the isolated review CMS. */

import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const RECEIPT = resolve(HERE, 'receipts/cms-cleanup.json');

async function request(path, {method = 'GET', body, token} = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
  return payload.data;
}

async function authenticate() {
  if (process.env.DIRECTUS_ADMIN_TOKEN) return process.env.DIRECTUS_ADMIN_TOKEN;
  if (!process.env.DIRECTUS_ADMIN_EMAIL || !process.env.DIRECTUS_ADMIN_PASSWORD) throw new Error('Directus admin credentials are required');
  return (await request('/auth/login', {method: 'POST', body: {email: process.env.DIRECTUS_ADMIN_EMAIL, password: process.env.DIRECTUS_ADMIN_PASSWORD}})).access_token;
}

const token = await authenticate();
const api = (path, options = {}) => request(path, {...options, token});
const sites = await api('/items/pearl_sites?filter[slug][_eq]=lowen-perio&limit=-1&fields=id,slug,internal_name');
const siteIds = sites.map(item => item.id);
const pages = siteIds.length ? await api(`/items/pearl_pages?filter[site][_in]=${siteIds.join(',')}&limit=-1&fields=id,slug`) : [];
const pageIds = pages.map(item => item.id);
const builders = pageIds.length ? await api(`/items/pearl_page_builder?filter[page][_in]=${pageIds.join(',')}&limit=-1&fields=id,page,collection,item`) : [];
const navigation = siteIds.length ? await api(`/items/pearl_navigation_items?filter[site][_in]=${siteIds.join(',')}&limit=-1&fields=id`) : [];
const forms = await api('/items/pearl_forms?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name');
const runs = await api('/items/pearl_migration_runs?filter[internal_name][_starts_with]=Lowen%20Perio%20%C2%B7%20Baseline%20&limit=-1&fields=id,internal_name');
const media = await api('/items/pearl_media_assets?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,file,internal_name');
const files = [...new Set(media.map(item => typeof item.file === 'object' ? item.file?.id : item.file).filter(Boolean))];

const inventory = {
  sites: sites.length,
  pages: pages.length,
  builders: builders.length,
  components: builders.length,
  navigation: navigation.length,
  forms: forms.length,
  migration_runs: runs.length,
  media_assets: media.length,
  files: files.length,
};

async function remove(collection, id) {
  await api(`/items/${collection}/${id}`, {method: 'DELETE'});
}

if (APPLY) {
  for (const row of builders) await remove('pearl_page_builder', row.id);
  for (const row of builders) {
    const id = typeof row.item === 'object' ? row.item?.id : row.item;
    if (id && row.collection) await remove(row.collection, id);
  }
  for (const row of navigation) await remove('pearl_navigation_items', row.id);
  for (const row of pages) await remove('pearl_pages', row.id);
  for (const row of sites) await remove('pearl_sites', row.id);
  for (const row of forms) await remove('pearl_forms', row.id);
  for (const row of runs) await remove('pearl_migration_runs', row.id);
  for (const row of media) await remove('pearl_media_assets', row.id);
  for (const id of files) await api(`/files/${id}`, {method: 'DELETE'});
}

const after = APPLY ? {
  sites: (await api('/items/pearl_sites?filter[slug][_eq]=lowen-perio&limit=1&fields=id')).length,
  pages: (await api('/items/pearl_pages?filter[internal_name][_starts_with]=Lowen%20Perio%20%C2%B7%20&limit=-1&fields=id')).length,
  components: (await Promise.all([...new Set(builders.map(item => item.collection))].map(async collection => (await api(`/items/${collection}?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id`)).length))).reduce((sum, count) => sum + count, 0),
} : null;
const ok = !APPLY || (after.sites === 0 && after.pages === 0 && after.components === 0);
const receipt = {ok, mode: APPLY ? 'apply' : 'dry-run', target: BASE, exact_scope: 'lowen-perio isolated review records only', inventory, after};
await mkdir(dirname(RECEIPT), {recursive: true});
await writeFile(RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (!ok) process.exit(1);
