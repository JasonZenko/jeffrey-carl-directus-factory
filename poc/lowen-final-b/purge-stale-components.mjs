#!/usr/bin/env node
/** Remove only unattached Lowen component records, including superseded Final B rows. */

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const BASELINE = process.env.PEARL_BASELINE || 'Final B';
const ITEM_PREFIX = `Lowen ${BASELINE}`;
const ASSET_FOLDER = process.env.PEARL_PUBLIC_ASSET_FOLDER_ID;
const contract = JSON.parse(await readFile(resolve(HERE, '../lowen-baseline-a/contract/pearl-block-library.v1.json'), 'utf8'));
const pages = JSON.parse(await readFile(resolve(HERE, '../lowen-baseline-a/migration/pages.json'), 'utf8'));
const site = JSON.parse(await readFile(resolve(HERE, '../lowen-baseline-a/migration/site.json'), 'utf8'));
if (!ASSET_FOLDER) throw new Error('PEARL_PUBLIC_ASSET_FOLDER_ID is required for fail-closed media cleanup');

function collectAssets(value, assets = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssets(item, assets);
  } else if (value && typeof value === 'object') {
    if (value.sha256 && value.local_path) assets.set(value.sha256, value);
    for (const child of Object.values(value)) collectAssets(child, assets);
  }
  return assets;
}

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
  if (!process.env.DIRECTUS_ADMIN_EMAIL || !process.env.DIRECTUS_ADMIN_PASSWORD) throw new Error('Directus administrator credentials are required');
  return (await request('/auth/login', {method: 'POST', body: {email: process.env.DIRECTUS_ADMIN_EMAIL, password: process.env.DIRECTUS_ADMIN_PASSWORD}})).access_token;
}

const token = await authenticate();
const api = (path, options = {}) => request(path, {...options, token});
const sites = await api('/items/pearl_sites?filter[slug][_eq]=lowen-perio&limit=1&fields=id');
if (!sites[0]) throw new Error('Lowen site is missing; refusing orphan purge');
const builder = await api(`/items/pearl_page_builder?filter[page][site][_eq]=${sites[0].id}&limit=-1&fields=collection,item`);
const attached = new Map();
for (const row of builder) {
  if (!attached.has(row.collection)) attached.set(row.collection, new Set());
  attached.get(row.collection).add(typeof row.item === 'object' ? row.item?.id : row.item);
}
const inventory = {};
for (const collection of [...new Set(contract.blocks.map(block => block.collection))]) {
  const records = await api(`/items/${collection}?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name`);
  inventory[collection] = records.filter(record => !attached.get(collection)?.has(record.id));
  if (records.some(record => attached.get(collection)?.has(record.id) && inventory[collection].some(candidate => candidate.id === record.id))) {
    throw new Error(`${collection} selection included an attached component; refusing purge`);
  }
}

const expectedAssets = collectAssets({site, pages});
const expectedMediaNames = new Set([...expectedAssets.keys()].map(sha256 => `${ITEM_PREFIX} · ${sha256.slice(0, 12)}`));
const lowenMedia = await api('/items/pearl_media_assets?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name,file');
const protectedMedia = lowenMedia.filter(record => expectedMediaNames.has(record.internal_name));
if (protectedMedia.length !== expectedMediaNames.size) {
  throw new Error(`Expected ${expectedMediaNames.size} current Lowen media records before purge, received ${protectedMedia.length}`);
}
const protectedFiles = new Set(protectedMedia.map(record => typeof record.file === 'object' ? record.file?.id : record.file).filter(Boolean));
const staleMedia = lowenMedia.filter(record => !expectedMediaNames.has(record.internal_name));
const staleFiles = [];
for (const record of staleMedia) {
  const fileId = typeof record.file === 'object' ? record.file?.id : record.file;
  if (!fileId || protectedFiles.has(fileId)) throw new Error(`Stale media ${record.id} does not resolve to an exclusively stale file`);
  const file = await api(`/files/${fileId}?fields=id,title,folder`);
  const folderId = typeof file.folder === 'object' ? file.folder?.id : file.folder;
  if (folderId !== ASSET_FOLDER || !file.title?.startsWith('Lowen ')) {
    throw new Error(`File ${fileId} falls outside the isolated Lowen asset scope; refusing purge`);
  }
  staleFiles.push(file);
}

if (APPLY) {
  for (const [collection, records] of Object.entries(inventory)) {
    for (const record of records) await api(`/items/${collection}/${record.id}`, {method: 'DELETE'});
  }
  for (const record of staleMedia) await api(`/items/pearl_media_assets/${record.id}`, {method: 'DELETE'});
  for (const file of staleFiles) await api(`/files/${file.id}`, {method: 'DELETE'});
}

const after = {};
for (const collection of Object.keys(inventory)) {
  const records = await api(`/items/${collection}?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name`);
  after[collection] = records.filter(record => !attached.get(collection)?.has(record.id)).length;
}
const mediaAfter = await api('/items/pearl_media_assets?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name,file');
const staleMediaAfter = mediaAfter.filter(record => !expectedMediaNames.has(record.internal_name));
const selected = Object.fromEntries(Object.entries(inventory).map(([collection, records]) => [collection, records.length]));
const ok = !APPLY || (Object.values(after).every(count => count === 0) && staleMediaAfter.length === 0 && mediaAfter.length === expectedMediaNames.size);
const receipt = {
  ok, mode: APPLY ? 'apply' : 'dry-run', target: BASE,
  exact_scope: 'unattached Lowen component records plus superseded Lowen media records/files in the isolated asset folder',
  attached_components_protected_fail_closed: true,
  current_media_protected_fail_closed: true,
  selected,
  after,
  media_cleanup: {expected: expectedMediaNames.size, before: lowenMedia.length, selected: staleMedia.length, files_selected: staleFiles.length, after: mediaAfter.length, stale_after: staleMediaAfter.length},
};
await mkdir(resolve(HERE, 'receipts'), {recursive: true});
await writeFile(resolve(HERE, 'receipts/stale-component-purge.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (!ok) process.exit(1);
