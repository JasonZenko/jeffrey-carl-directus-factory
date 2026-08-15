#!/usr/bin/env node
/** Remove only orphaned Lowen component records that are not Final B. */

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const contract = JSON.parse(await readFile(resolve(HERE, '../lowen-baseline-a/contract/pearl-block-library.v1.json'), 'utf8'));

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
const inventory = {};
for (const collection of [...new Set(contract.blocks.map(block => block.collection))]) {
  const records = await api(`/items/${collection}?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name`);
  inventory[collection] = records.filter(record => !record.internal_name?.startsWith('Lowen Final B · '));
  if (inventory[collection].some(record => record.internal_name?.startsWith('Lowen Final B'))) throw new Error(`${collection} selection included Final B records; refusing purge`);
}

if (APPLY) {
  for (const [collection, records] of Object.entries(inventory)) {
    for (const record of records) await api(`/items/${collection}/${record.id}`, {method: 'DELETE'});
  }
}

const after = {};
for (const collection of Object.keys(inventory)) {
  const records = await api(`/items/${collection}?filter[internal_name][_starts_with]=Lowen%20&limit=-1&fields=id,internal_name`);
  after[collection] = records.filter(record => !record.internal_name?.startsWith('Lowen Final B · ')).length;
}
const selected = Object.fromEntries(Object.entries(inventory).map(([collection, records]) => [collection, records.length]));
const ok = !APPLY || Object.values(after).every(count => count === 0);
const receipt = {ok, mode: APPLY ? 'apply' : 'dry-run', target: BASE, exact_scope: 'orphan Lowen component records whose internal_name is not prefixed Lowen Final B ·', final_b_excluded_fail_closed: true, selected, after};
await mkdir(resolve(HERE, 'receipts'), {recursive: true});
await writeFile(resolve(HERE, 'receipts/stale-component-purge.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (!ok) process.exit(1);
