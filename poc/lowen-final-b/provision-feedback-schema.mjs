#!/usr/bin/env node
/** Apply the reviewed Pearl 1.2 field and navigation contract idempotently. */

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const contract = JSON.parse(await readFile(resolve(HERE, '../lowen-baseline-a/contract/pearl-block-library.v1.json'), 'utf8'));

async function raw(path, {method = 'GET', body, token} = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 1200)}`);
  return payload.data;
}

async function authenticate() {
  if (process.env.DIRECTUS_ADMIN_TOKEN) return process.env.DIRECTUS_ADMIN_TOKEN;
  if (!process.env.DIRECTUS_ADMIN_EMAIL || !process.env.DIRECTUS_ADMIN_PASSWORD) throw new Error('Directus administrator credentials are required');
  return (await raw('/auth/login', {method: 'POST', body: {email: process.env.DIRECTUS_ADMIN_EMAIL, password: process.env.DIRECTUS_ADMIN_PASSWORD}})).access_token;
}

const token = await authenticate();
const api = (path, options = {}) => raw(path, {...options, token});
const actions = [];
const canonicalise = value => {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalise(value[key])]));
  }
  return value;
};
const canonicalJson = value => JSON.stringify(canonicalise(value));

async function getField(collection, field) {
  const response = await fetch(`${BASE}/fields/${collection}/${field}`, {headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}});
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GET /fields/${collection}/${field} -> ${response.status}`);
  return payload.data;
}

async function ensureField(collection, definition) {
  const current = await getField(collection, definition.field);
  actions.push({target: `${collection}.${definition.field}`, action: current ? 'verified' : 'created'});
  if (!APPLY) return;
  if (!current) await api(`/fields/${collection}`, {method: 'POST', body: definition});
  else await api(`/fields/${collection}/${definition.field}`, {method: 'PATCH', body: {meta: {...current.meta, ...definition.meta}}});
}

await ensureField('pearl_icon_feature_card_items', {
  field: 'link_title', type: 'string',
  meta: {interface: 'input', width: 'full', note: 'Source anchor title metadata. Used as the link title attribute; never rendered as visible card copy.'},
  schema: {is_nullable: true, max_length: 512},
});
await ensureField('pearl_highlight_snippet_quote', {
  field: 'snippet', type: 'string',
  meta: {interface: 'input', width: 'full', note: 'Short source-backed headline rendered above the quote.'},
  schema: {is_nullable: true, max_length: 512},
});
await ensureField('pearl_navigation_items', {
  field: 'parent', type: 'uuid',
  meta: {interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: 'Optional parent item. Leave empty for primary navigation; select a primary item for subnavigation.'},
  schema: {is_nullable: true},
});

const relations = await api('/relations?limit=-1');
let parentRelation = relations.find(item => item.collection === 'pearl_navigation_items' && item.field === 'parent');
actions.push({target: 'pearl_navigation_items.parent relation', action: parentRelation ? 'verified' : 'created'});
if (APPLY && !parentRelation) {
  await api('/relations', {method: 'POST', body: {
    collection: 'pearl_navigation_items', field: 'parent', related_collection: 'pearl_navigation_items',
    meta: {one_field: null}, schema: {on_delete: 'CASCADE'},
  }});
}

const library = await api('/items/pearl_block_library?limit=-1&fields=id,key,field_contract,status');
for (const block of contract.blocks) {
  const row = library.find(item => item.key === block.key);
  if (!row) throw new Error(`Official Pearl block is missing: ${block.key}`);
  const fieldContract = {fields: block.fields, ...(block.children ? {children: block.children} : {})};
  actions.push({target: `pearl_block_library.${block.key}`, action: APPLY ? 'synchronised' : 'would_synchronise'});
  if (APPLY) await api(`/items/pearl_block_library/${row.id}`, {method: 'PATCH', body: {status: 'published', field_contract: fieldContract}});
}

const verifiedFields = await Promise.all([
  getField('pearl_icon_feature_card_items', 'link_title'),
  getField('pearl_highlight_snippet_quote', 'snippet'),
  getField('pearl_navigation_items', 'parent'),
]);
if (APPLY) {
  const finalRelations = await api('/relations?limit=-1');
  parentRelation = finalRelations.find(item => item.collection === 'pearl_navigation_items' && item.field === 'parent');
}
const finalLibrary = await api('/items/pearl_block_library?limit=-1&fields=key,field_contract,status');
const expectedByKey = new Map(contract.blocks.map(block => [block.key, canonicalJson({fields: block.fields, ...(block.children ? {children: block.children} : {})})]));
const contractParity = !APPLY || (finalLibrary.length === contract.blocks.length && finalLibrary.every(row => row.status === 'published' && canonicalJson(row.field_contract) === expectedByKey.get(row.key)));
const relationVerified = Boolean(parentRelation && parentRelation.related_collection === 'pearl_navigation_items');
const ok = !APPLY || (verifiedFields.every(Boolean) && relationVerified && contractParity);
const receipt = {ok, mode: APPLY ? 'apply' : 'dry-run', target: BASE, contract_version: contract.version, fields_verified: verifiedFields.filter(Boolean).length, navigation_self_relation: relationVerified, official_library_parity: contractParity, actions};
await mkdir(resolve(HERE, 'receipts'), {recursive: true});
await writeFile(resolve(HERE, 'receipts/feedback-schema.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (!ok) process.exit(1);
