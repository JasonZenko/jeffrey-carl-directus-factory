#!/usr/bin/env node
import { buildPearlSchemaPlan, validatePearlSchemaPlan } from './pearl-schema.mjs';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const json = args.has('--json');
const baseUrl = (process.env.DIRECTUS_URL ?? '').replace(/\/$/, '');
const token = process.env.DIRECTUS_ADMIN_TOKEN ?? '';
const plan = buildPearlSchemaPlan();
const errors = validatePearlSchemaPlan(plan);

if (errors.length) throw new Error(`Invalid Pearl schema plan:\n${errors.join('\n')}`);

if (!apply) {
  if (json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  else console.log(`Dry run: ${plan.collections.length} collections, ${plan.fields.length} fields, ${plan.relations.length} relations. Pass --apply to provision.`);
  process.exit(0);
}

if (!baseUrl || !token) {
  throw new Error('DIRECTUS_URL and DIRECTUS_ADMIN_TOKEN are required with --apply');
}
if (!/^https:\/\//.test(baseUrl)) throw new Error('DIRECTUS_URL must use HTTPS');

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const existingCollections = new Set((await request('GET', '/collections')).data.map((item) => item.collection));
for (const required of plan.requires) {
  if (!existingCollections.has(required)) throw new Error(`Required base collection missing: ${required}`);
}

for (const collection of plan.collections) {
  if (existingCollections.has(collection.collection)) continue;
  await request('POST', '/collections', collection);
  existingCollections.add(collection.collection);
  console.log(`created collection ${collection.collection}`);
}

const existingFields = new Set();
for (const collection of [...plan.requires, ...plan.collections.map((item) => item.collection)]) {
  const fields = (await request('GET', `/fields/${collection}`)).data;
  for (const field of fields) existingFields.add(`${collection}.${field.field}`);
}
for (const field of plan.fields) {
  const key = `${field.collection}.${field.field}`;
  if (existingFields.has(key)) continue;
  await request('POST', `/fields/${field.collection}`, field);
  existingFields.add(key);
  console.log(`created field ${key}`);
}

const existingRelations = new Set((await request('GET', '/relations')).data.map((item) => `${item.collection}.${item.field}`));
for (const relation of plan.relations) {
  const key = `${relation.collection}.${relation.field}`;
  if (existingRelations.has(key)) continue;
  await request('POST', '/relations', relation);
  existingRelations.add(key);
  console.log(`created relation ${key}`);
}

console.log(`Pearl schema ready: ${plan.adapter}`);
