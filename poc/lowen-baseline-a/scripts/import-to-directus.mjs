#!/usr/bin/env node
/** Import the frozen Lowen object map without imposing a target page skeleton. */

import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCanonicalContract, validateContractParity, validateRelease} from './validate-release.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const REVIEW = (process.env.PEARL_REVIEW_BASE_URL || 'https://pearl-lowen-poc.pages.dev').replace(/\/$/, '');
const ASSET_FOLDER = process.env.PEARL_PUBLIC_ASSET_FOLDER_ID;
const APPLY = process.argv.includes('--apply');
const BASELINE = process.env.PEARL_BASELINE || 'A';
const RUN_LABEL = `Lowen Perio · Baseline ${BASELINE}`;
const ITEM_PREFIX = `Lowen ${BASELINE}`;
const RECEIPTS_DIR = resolve(process.env.PEARL_RECEIPTS_DIR || resolve(ROOT, 'receipts'));
const siteSource = JSON.parse(await readFile(resolve(ROOT, 'migration/site.json'), 'utf8'));
const pages = JSON.parse(await readFile(resolve(ROOT, 'migration/pages.json'), 'utf8'));
const mappingReceipt = JSON.parse(await readFile(resolve(ROOT, 'migration/mapping-receipt.json'), 'utf8'));
const exceptions = JSON.parse(await readFile(resolve(ROOT, 'migration/exceptions.json'), 'utf8'));
const canonicalContract = await loadCanonicalContract();
const releaseErrors = validateRelease({pages, exceptions, contract: canonicalContract});
if (releaseErrors.length) throw new Error(`Pearl release preflight failed:\n- ${releaseErrors.join('\n- ')}`);

if (!ASSET_FOLDER) throw new Error('PEARL_PUBLIC_ASSET_FOLDER_ID is required');

async function raw(path, {method = 'GET', body, token} = {}) {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const headers = {Accept: 'application/json'};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (response.status === 429 && attempt < 6) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 1500)}`);
    return payload.data;
  }
  throw new Error(`${method} ${path} exhausted retries`);
}

async function authenticate() {
  if (process.env.DIRECTUS_ADMIN_TOKEN) return process.env.DIRECTUS_ADMIN_TOKEN;
  if (!process.env.DIRECTUS_ADMIN_EMAIL || !process.env.DIRECTUS_ADMIN_PASSWORD) {
    throw new Error('Directus administrator credentials are required');
  }
  return (await raw('/auth/login', {
    method: 'POST',
    body: {email: process.env.DIRECTUS_ADMIN_EMAIL, password: process.env.DIRECTUS_ADMIN_PASSWORD},
  })).access_token;
}

function previewPath(slug) {
  return slug === 'home' ? '/' : `/${slug}/`;
}

function pageTitle(page) {
  return page.blocks.find(block => block.type === 'inner_hero_standard')?.item?.page_title
    || page.blocks.find(block => block.type === 'main_hero_standard')?.item?.heading
    || page.title;
}

function navigationCount(items) {
  return items.reduce((total, item) => total + 1 + navigationCount(item.children || []), 0);
}

if (!APPLY) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    target: BASE,
    source_pages: pages.length,
    source_blocks: mappingReceipt.blocks,
    homepage_sequence: mappingReceipt.homepage_sequence,
    navigation_items: navigationCount(siteSource.navigation),
    exceptions: exceptions.length,
    canonical_contract: canonicalContract.version,
    release_preflight: 'passed',
  }, null, 2));
  process.exit(0);
}

const startedAt = new Date().toISOString();
const token = await authenticate();
const api = (path, options = {}) => raw(path, {...options, token});
const libraryRows = await api('/items/pearl_block_library?limit=-1&fields=key,collection_name,field_contract,status');
const contract = new Map(libraryRows.map(item => [item.key, item]));
const contractErrors = validateContractParity(libraryRows, canonicalContract);
if (contractErrors.length) throw new Error(`Official Pearl contract parity failed:\n- ${contractErrors.join('\n- ')}`);

async function upsert(collection, key, value, payload) {
  const existing = await api(`/items/${collection}?filter[${key}][_eq]=${encodeURIComponent(value)}&limit=1&fields=id`);
  if (existing[0]) return api(`/items/${collection}/${existing[0].id}`, {method: 'PATCH', body: payload});
  return api(`/items/${collection}`, {method: 'POST', body: payload});
}

async function assetPath(asset) {
  const candidates = [
    resolve(ROOT, 'source-freeze', asset.local_path),
    resolve(ROOT, asset.local_path),
  ];
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(`Frozen asset is missing: ${asset.local_path}`);
}

const uploaded = new Map();
const mimeExtension = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'image/gif': 'gif',
};
async function ensureAsset(asset) {
  if (!asset?.local_path) return null;
  if (uploaded.has(asset.sha256)) return uploaded.get(asset.sha256);
  const title = `${ITEM_PREFIX} · ${asset.sha256.slice(0, 12)} · ${asset.alt || basename(asset.local_path)}`.slice(0, 255);
  const existing = await api(`/files?filter[title][_eq]=${encodeURIComponent(title)}&limit=1&fields=id`);
  let fileId;
  if (existing[0]) {
    fileId = existing[0].id;
  } else {
    const path = await assetPath(asset);
    const bytes = await readFile(path);
    const extension = mimeExtension[asset.content_type] || 'bin';
    const form = new FormData();
    form.append('title', title);
    form.append('folder', ASSET_FOLDER);
    form.append('file', new Blob([bytes], {type: asset.content_type || 'application/octet-stream'}), `lowen-${asset.sha256.slice(0, 12)}.${extension}`);
    const file = await api('/files', {method: 'POST', body: form});
    fileId = file.id;
  }
  uploaded.set(asset.sha256, fileId);
  await upsert('pearl_media_assets', 'internal_name', `${ITEM_PREFIX} · ${asset.sha256.slice(0, 12)}`, {
    status: 'published',
    internal_name: `${ITEM_PREFIX} · ${asset.sha256.slice(0, 12)}`,
    source_url: asset.source_url,
    file: fileId,
    alt_text: asset.alt || '',
  });
  return fileId;
}

function validateRequired(spec, item, internalName) {
  for (const field of spec.field_contract?.fields || []) {
    if (field.required && (item[field.name] === undefined || item[field.name] === null || item[field.name] === '')) {
      throw new Error(`${internalName} is missing required field ${field.name}`);
    }
  }
  const childrenSpec = spec.field_contract?.children;
  if (!childrenSpec) return;
  const children = item[childrenSpec.alias] || [];
  if (!children.length) throw new Error(`${internalName} has no ${childrenSpec.alias}`);
  for (const [index, child] of children.entries()) {
    for (const field of childrenSpec.fields || []) {
      if (field.required && (child[field.name] === undefined || child[field.name] === null || child[field.name] === '')) {
        throw new Error(`${internalName} child ${index + 1} is missing required field ${field.name}`);
      }
    }
  }
}

async function prepareRecord(spec, internalName, sourceItem) {
  validateRequired(spec, sourceItem, internalName);
  const item = structuredClone(sourceItem);
  const fields = spec.field_contract?.fields || [];
  for (const field of fields.filter(field => field.file)) {
    if (item[field.name]?.local_path) item[field.name] = await ensureAsset(item[field.name]);
  }
  const childrenSpec = spec.field_contract?.children;
  const children = childrenSpec ? item[childrenSpec.alias] || [] : [];
  if (childrenSpec) delete item[childrenSpec.alias];
  const parent = await upsert(spec.collection_name, 'internal_name', internalName, {
    ...item, status: 'published', internal_name: internalName,
  });
  if (childrenSpec) {
    const existing = await api(`/items/${childrenSpec.collection}?filter[parent][_eq]=${parent.id}&limit=-1&fields=id,sort`);
    const used = new Set();
    for (const [index, childSource] of children.entries()) {
      const child = structuredClone(childSource);
      const sort = Number(child.sort ?? index + 1);
      child.sort = sort;
      for (const field of childrenSpec.fields.filter(field => field.file)) {
        if (child[field.name]?.local_path) child[field.name] = await ensureAsset(child[field.name]);
      }
      const current = existing.find(row => Number(row.sort) === sort);
      const payload = {...child, parent: parent.id, status: 'published', internal_name: `${internalName} · ${sort}`};
      if (current) {
        await api(`/items/${childrenSpec.collection}/${current.id}`, {method: 'PATCH', body: payload});
        used.add(current.id);
      } else {
        const created = await api(`/items/${childrenSpec.collection}`, {method: 'POST', body: payload});
        used.add(created.id);
      }
    }
    for (const stale of existing.filter(row => !used.has(row.id))) {
      await api(`/items/${childrenSpec.collection}/${stale.id}`, {method: 'DELETE'});
    }
  }
  return {collection: spec.collection_name, item: parent.id};
}

async function prepareBlock(page, index, block) {
  const spec = contract.get(block.type);
  if (!spec) throw new Error(`Unknown official block: ${block.type}`);
  const name = `${ITEM_PREFIX} · ${page.slug} · ${String(index + 1).padStart(2, '0')} · ${block.type}`;
  return prepareRecord(spec, name, block.item);
}

async function bindPage(page, site, blocks) {
  const record = await upsert('pearl_pages', 'slug', page.slug, {
    status: 'published',
    internal_name: `Lowen Perio · ${page.slug}`,
    site: site.id,
    slug: page.slug,
    title: pageTitle(page),
    meta_description: page.meta_description || page.title,
    workflow_status: 'approved',
    approval_notes: `Baseline ${BASELINE} dynamic object migration from frozen WEO Pearl source.`,
    approved_at: new Date().toISOString(),
    robots_index: false,
    robots_follow: false,
  });
  const prepared = [];
  for (const [index, block] of blocks.entries()) prepared.push(await prepareBlock(page, index, block));
  const rows = await api(`/items/pearl_page_builder?filter[page][_eq]=${record.id}&limit=-1&sort=sort&fields=id,sort`);
  const used = new Set();
  for (const [index, block] of prepared.entries()) {
    const sort = index + 1;
    const current = rows.find(row => Number(row.sort) === sort);
    const payload = {page: record.id, sort, collection: block.collection, item: block.item};
    if (current) {
      await api(`/items/pearl_page_builder/${current.id}`, {method: 'PATCH', body: payload});
      used.add(current.id);
    } else {
      const created = await api('/items/pearl_page_builder', {method: 'POST', body: payload});
      used.add(created.id);
    }
  }
  for (const stale of rows.filter(row => !used.has(row.id))) {
    await api(`/items/pearl_page_builder/${stale.id}`, {method: 'DELETE'});
  }
  return {id: record.id, slug: record.slug, blocks: prepared.map(item => item.collection)};
}

const logo = await ensureAsset(siteSource.logo);
const site = await upsert('pearl_sites', 'slug', siteSource.slug, {
  status: 'published',
  internal_name: RUN_LABEL,
  name: siteSource.name,
  slug: siteSource.slug,
  preview_url: `${REVIEW}/`,
  logo,
  phone: siteSource.theme.phone,
  email: siteSource.theme.email,
  address: siteSource.theme.address,
});

const theme = structuredClone(siteSource.theme);
for (const field of ['h1_weight', 'h2_weight', 'h3_weight', 'body_weight']) theme[field] = Number(theme[field]);
await api('/items/pearl_theme_settings', {method: 'PATCH', body: {status: 'published', ...theme}});

const importedPages = [];
for (const page of pages) importedPages.push(await bindPage(page, site, page.blocks));

const existingNavigation = await api(`/items/pearl_navigation_items?filter[site][_eq]=${site.id}&limit=-1&fields=id,internal_name`);
const usedNavigation = new Set();
const navigationParents = new Map();
for (const [index, item] of siteSource.navigation.entries()) {
  const internalName = `${ITEM_PREFIX} · navigation · ${index + 1}`;
  const row = await upsert('pearl_navigation_items', 'internal_name', internalName, {
    status: 'published', internal_name: internalName, site: site.id,
    label: item.label, url: item.url, sort: Number(item.sort ?? index + 1), parent: null,
  });
  usedNavigation.add(row.id);
  navigationParents.set(index, row.id);
}
for (const [parentIndex, item] of siteSource.navigation.entries()) {
  for (const [childIndex, child] of (item.children || []).entries()) {
    const internalName = `${ITEM_PREFIX} · navigation · ${parentIndex + 1}.${childIndex + 1}`;
    const row = await upsert('pearl_navigation_items', 'internal_name', internalName, {
      status: 'published', internal_name: internalName, site: site.id,
      label: child.label, url: child.url, sort: Number(child.sort ?? childIndex + 1),
      parent: navigationParents.get(parentIndex),
    });
    usedNavigation.add(row.id);
  }
}
for (const stale of existingNavigation.filter(row => !usedNavigation.has(row.id))) {
  await api(`/items/pearl_navigation_items/${stale.id}`, {method: 'DELETE'});
}

for (const [index, exception] of exceptions.entries()) {
  if (!exception.url) continue;
  const provider = exception.provider || 'external';
  const internalName = `${ITEM_PREFIX} · provider exception · ${index + 1}`;
  await upsert('pearl_forms', 'internal_name', internalName, {
    status: 'published', internal_name: internalName,
    name: `${provider} ${exception.kind}`, provider, embed_url: exception.url,
  });
}

const completedAt = new Date().toISOString();
await upsert('pearl_migration_runs', 'internal_name', RUN_LABEL, {
  status: 'published',
  internal_name: RUN_LABEL,
  source_url: mappingReceipt.source,
  started_at: startedAt,
  completed_at: completedAt,
  summary: {
    ...mappingReceipt,
    imported_pages: importedPages.length,
    uploaded_assets: uploaded.size,
    exception_detail: exceptions,
  },
});

const home = importedPages.find(page => page.slug === 'home');
const expectedHome = mappingReceipt.homepage_sequence.map(key => contract.get(key).collection_name);
if (!home || home.blocks.join(',') !== expectedHome.join(',')) {
  throw new Error('Imported homepage no longer matches the source-derived object sequence');
}

const receipt = {
  ok: true,
  baseline: BASELINE,
  target: BASE,
  source_pages: pages.length,
  imported_pages: importedPages.length,
  imported_blocks: importedPages.reduce((total, page) => total + page.blocks.length, 0),
  uploaded_assets: uploaded.size,
  navigation_items: navigationCount(siteSource.navigation),
  homepage_blocks: home.blocks,
  homepage_source_derived: true,
  canonical_contract: canonicalContract.version,
  release_preflight: 'passed',
  exceptions: exceptions.length,
  started_at: startedAt,
  completed_at: completedAt,
};
await mkdir(RECEIPTS_DIR, {recursive: true});
await writeFile(resolve(RECEIPTS_DIR, 'directus-import.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
