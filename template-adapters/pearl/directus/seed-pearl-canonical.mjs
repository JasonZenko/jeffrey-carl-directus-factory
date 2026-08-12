#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const BASE = (process.env.DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const seed = JSON.parse(await readFile(resolve(HERE, 'canonical-seed.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(HERE, '../v0.1.0/manifest.json'), 'utf8'));

async function raw(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
  return payload.data;
}

async function authenticate() {
  if (process.env.DIRECTUS_ADMIN_TOKEN) return process.env.DIRECTUS_ADMIN_TOKEN;
  const email = process.env.DIRECTUS_ADMIN_EMAIL;
  const password = process.env.DIRECTUS_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('DIRECTUS_ADMIN_TOKEN or DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD are required with --apply');
  return (await raw('/auth/login', { method: 'POST', body: { email, password } })).access_token;
}

if (!APPLY) {
  console.log(JSON.stringify({ mode: 'dry-run', page: seed.page.slug, blocks: seed.blocks.length, target: BASE }, null, 2));
  process.exit(0);
}

const token = await authenticate();
const api = (path, options = {}) => raw(path, { ...options, token });
const blockContract = new Map(manifest.blocks.map((block) => [block.key, block]));

async function upsert(collection, key, value, payload) {
  const rows = await api(`/items/${collection}?filter[${key}][_eq]=${encodeURIComponent(value)}&limit=1`);
  if (rows[0]) return api(`/items/${collection}/${rows[0].id}`, { method: 'PATCH', body: payload });
  return api(`/items/${collection}`, { method: 'POST', body: payload });
}

const mimeByExtension = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
async function ensureFile(source) {
  const isIcon = source.length === 1;
  const filename = isIcon ? `pearl-service-${source.toLowerCase()}.svg` : basename(source);
  const existing = await api(`/files?filter[filename_download][_eq]=${encodeURIComponent(filename)}&limit=1&fields=id`);
  if (existing[0]) return existing[0].id;
  let bytes;
  let mime;
  if (isIcon) {
    bytes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="none" stroke="#66745c" stroke-width="4"/><text x="60" y="75" text-anchor="middle" font-family="Georgia,serif" font-size="48" fill="#243229">${source}</text></svg>`);
    mime = 'image/svg+xml';
  } else {
    const path = resolve(ROOT, source);
    await stat(path);
    bytes = await readFile(path);
    mime = mimeByExtension[extname(path).toLowerCase()] ?? 'application/octet-stream';
  }
  const form = new FormData();
  form.append('title', `Pearl canonical · ${filename}`);
  form.append('file', new Blob([bytes], { type: mime }), filename);
  return (await api('/files', { method: 'POST', body: form })).id;
}

async function prepareBlock(block) {
  const contract = blockContract.get(block.type);
  if (!contract) throw new Error(`Unknown Pearl block: ${block.type}`);
  const item = structuredClone(block.item);
  for (const field of contract.fields.filter((entry) => entry.type === 'file')) {
    if (item[field.name]) item[field.name] = await ensureFile(item[field.name]);
  }
  const childAlias = contract.fields.find((entry) => entry.type === 'o2m')?.name;
  const children = childAlias ? item[childAlias] ?? [] : [];
  if (childAlias) delete item[childAlias];
  const internalName = `Pearl canonical · ${block.type}`;
  const parent = await upsert(contract.directus.collection, 'internal_name', internalName, {
    ...item, status: 'published', internal_name: internalName,
  });
  if (childAlias) {
    const childCollection = contract.directus.children;
    const existing = await api(`/items/${childCollection}?filter[parent][_eq]=${parent.id}&limit=-1`);
    for (const child of children) {
      const payload = structuredClone(child);
      for (const field of (contract.child_fields ?? []).filter((entry) => entry.type === 'file' || entry.type === 'file_or_svg')) {
        if (payload[field.name]) payload[field.name] = await ensureFile(payload[field.name]);
      }
      const current = existing.find((entry) => Number(entry.sort) === Number(payload.sort));
      const body = { ...payload, parent: parent.id, status: 'published', internal_name: `${internalName} · ${payload.sort}` };
      if (current) await api(`/items/${childCollection}/${current.id}`, { method: 'PATCH', body });
      else await api(`/items/${childCollection}`, { method: 'POST', body });
    }
    const keep = new Set(children.map((child) => Number(child.sort)));
    for (const extra of existing.filter((entry) => !keep.has(Number(entry.sort)))) {
      await api(`/items/${childCollection}/${extra.id}`, { method: 'DELETE' });
    }
  }
  return { type: block.type, collection: contract.directus.collection, item: parent.id };
}

const page = await upsert('weo_pearl_pages', 'slug', seed.page.slug, {
  ...seed.page,
  status: 'published',
  internal_name: 'Pearl canonical component workshop',
  robots_index: false,
  robots_follow: false,
});
const prepared = [];
for (const block of seed.blocks) prepared.push(await prepareBlock(block));
const rows = await api(`/items/weo_pearl_page_builder?filter[page][_eq]=${page.id}&limit=-1`);
for (const [index, block] of prepared.entries()) {
  const sort = index + 1;
  const current = rows.find((row) => Number(row.sort) === sort);
  const body = { page: page.id, sort, collection: block.collection, item: block.item };
  if (current) await api(`/items/weo_pearl_page_builder/${current.id}`, { method: 'PATCH', body });
  else await api('/items/weo_pearl_page_builder', { method: 'POST', body });
}
for (const extra of rows.filter((row) => Number(row.sort) > prepared.length)) {
  await api(`/items/weo_pearl_page_builder/${extra.id}`, { method: 'DELETE' });
}

console.log(JSON.stringify({ ok: true, target: BASE, page: page.slug, blocks: prepared.length }, null, 2));
