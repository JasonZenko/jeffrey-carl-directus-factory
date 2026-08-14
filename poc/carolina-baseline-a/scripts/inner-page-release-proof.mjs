#!/usr/bin/env node
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT = resolve(ROOT, 'receipts/inner-page-release-proof.json');
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-poc-cms.foundryworks.ai').replace(/\/$/, '');
const MODE = process.argv[2];
const MARKER = process.env.PEARL_POC_MARKER || 'CAROLINA INNER-PAGE RELEASE PROOF';
const PAGE_SLUG = 'services-family-dentistry-root-canals';

if (!['apply', 'revert'].includes(MODE)) throw new Error('Usage: inner-page-release-proof.mjs apply|revert');

async function raw(path, {method = 'GET', body, token} = {}) {
  const headers = {Accept: 'application/json', 'User-Agent': 'Pearl-POC-Proof/1.0'};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 1200)}`);
  return payload.data;
}

async function authenticate() {
  if (process.env.DIRECTUS_ADMIN_TOKEN) return process.env.DIRECTUS_ADMIN_TOKEN;
  if (!process.env.DIRECTUS_ADMIN_EMAIL || !process.env.DIRECTUS_ADMIN_PASSWORD) throw new Error('Administrator credentials are required');
  return (await raw('/auth/login', {method: 'POST', body: {
    email: process.env.DIRECTUS_ADMIN_EMAIL,
    password: process.env.DIRECTUS_ADMIN_PASSWORD,
  }})).access_token;
}

const token = await authenticate();
const api = (path, options = {}) => raw(path, {...options, token});
const page = (await api(`/items/pearl_pages?filter[slug][_eq]=${PAGE_SLUG}&limit=1&fields=id,slug`))[0];
if (!page) throw new Error(`Proof page is missing: ${PAGE_SLUG}`);

const rows = async () => api(`/items/pearl_page_builder?filter[page][_eq]=${page.id}&limit=-1&sort=sort&fields=id,sort,collection,item`);

if (MODE === 'apply') {
  const before = await rows();
  const stale = await api(`/items/pearl_highlight_snippet_quote?filter[internal_name][_eq]=${encodeURIComponent('Carolina POC · inner-page release proof')}&limit=-1&fields=id`);
  if (stale.length) throw new Error('A stale inner-page proof component already exists');
  const block = await api('/items/pearl_highlight_snippet_quote', {method: 'POST', body: {
    status: 'published',
    internal_name: 'Carolina POC · inner-page release proof',
    quote: `<p>${MARKER}</p>`,
    attribution: 'Disposable automated acceptance proof',
    tone: 'primary',
  }});
  const builder = await api('/items/pearl_page_builder', {method: 'POST', body: {
    page: page.id,
    collection: 'pearl_highlight_snippet_quote',
    item: block.id,
    sort: Math.max(0, ...before.map(row => Number(row.sort))) + 1,
  }});
  const after = await rows();
  const receipt = {
    ok: true,
    cms: BASE,
    page: PAGE_SLUG,
    marker: MARKER,
    applied_at: new Date().toISOString(),
    before,
    applied: {builder_id: builder.id, block_id: block.id},
    after_apply: after,
    homepage_untouched: true,
  };
  await mkdir(dirname(RECEIPT), {recursive: true});
  await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ok: true, mode: MODE, page: PAGE_SLUG, before: before.length, after: after.length, marker: MARKER}, null, 2));
} else {
  const receipt = JSON.parse(await readFile(RECEIPT, 'utf8'));
  await api(`/items/pearl_page_builder/${receipt.applied.builder_id}`, {method: 'DELETE'});
  await api(`/items/pearl_highlight_snippet_quote/${receipt.applied.block_id}`, {method: 'DELETE'});
  const after = await rows();
  const canonical = value => value.map(({id, sort, collection, item}) => ({id, sort, collection, item}));
  receipt.reverted_at = new Date().toISOString();
  receipt.after_revert = after;
  receipt.rollback_exact = JSON.stringify(canonical(receipt.before)) === JSON.stringify(canonical(after));
  if (!receipt.rollback_exact) throw new Error('Inner-page release proof did not restore the original Builder rows exactly');
  await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ok: true, mode: MODE, page: PAGE_SLUG, rows: after.length, rollback_exact: true}, null, 2));
}
