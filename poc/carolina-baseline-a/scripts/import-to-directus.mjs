#!/usr/bin/env node
import {readFile, stat, writeFile, mkdir} from 'node:fs/promises';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-poc-cms.foundryworks.ai').replace(/\/$/, '');
const REVIEW = (process.env.PEARL_REVIEW_BASE_URL || 'https://pearl-carolina-poc.pages.dev').replace(/\/$/, '');
const ASSET_FOLDER = process.env.PEARL_PUBLIC_ASSET_FOLDER_ID;
const APPLY = process.argv.includes('--apply');
const pages = JSON.parse(await readFile(resolve(ROOT, 'migration/normalized-pages.json'), 'utf8'));
const mappingReceipt = JSON.parse(await readFile(resolve(ROOT, 'migration/mapping-receipt.json'), 'utf8'));
const exceptions = JSON.parse(await readFile(resolve(ROOT, 'migration/exceptions.json'), 'utf8'));
const HOME_SEQUENCE = mappingReceipt.homepage_contract;

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
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 1500)}`);
    return payload.data;
  }
  throw new Error(`${method} ${path} exhausted retries`);
}

async function authenticate() {
  if (process.env.DIRECTUS_ADMIN_TOKEN) return process.env.DIRECTUS_ADMIN_TOKEN;
  if (!process.env.DIRECTUS_ADMIN_EMAIL || !process.env.DIRECTUS_ADMIN_PASSWORD) throw new Error('Directus administrator credentials are required');
  return (await raw('/auth/login', {method: 'POST', body: {email: process.env.DIRECTUS_ADMIN_EMAIL, password: process.env.DIRECTUS_ADMIN_PASSWORD}})).access_token;
}

function previewPath(slug) {
  return slug === 'home' ? '/' : `/template-preview/pearl/${slug}/`;
}

function cleanLabel(page) {
  return page.h1
    .replace(/\s+(?:in|near)\s+Fayetteville,?\s*NC.*$/i, '')
    .replace(/^Painless\s+/i, '')
    .replace(/^Your\s+/i, '')
    .trim();
}

function section(page, pattern, fallback = 0) {
  return page.sections.find(item => new RegExp(pattern, 'i').test(item.heading)) || page.sections[fallback] || null;
}

function sourceBody(page) {
  const body = page.sections.map(item => `<h2>${item.heading}</h2>${item.body_html}`).join('');
  return body || page.intro_html || `<p>${page.h1}</p>`;
}

function selectImage(page, pattern, fallback = 0) {
  return page.images.find(item => item.local_path && new RegExp(pattern, 'i').test(`${item.alt || ''} ${item.source_url}`))
    || page.images.filter(item => item.local_path)[fallback]
    || null;
}

if (!APPLY) {
  console.log(JSON.stringify({mode: 'dry-run', target: BASE, source_pages: pages.length, homepage_sequence: HOME_SEQUENCE, exceptions: exceptions.length}, null, 2));
  process.exit(0);
}

const startedAt = new Date().toISOString();
const token = await authenticate();
const api = (path, options = {}) => raw(path, {...options, token});
const libraryRows = await api('/items/pearl_block_library?limit=-1&fields=key,collection_name,field_contract,status');
const contract = new Map(libraryRows.map(item => [item.key, item]));
if (libraryRows.length !== 14 || libraryRows.some(item => item.status !== 'published')) throw new Error('Official 14-block library is not ready');

async function upsert(collection, key, value, payload) {
  const existing = await api(`/items/${collection}?filter[${key}][_eq]=${encodeURIComponent(value)}&limit=1&fields=id`);
  if (existing[0]) return api(`/items/${collection}/${existing[0].id}`, {method: 'PATCH', body: payload});
  return api(`/items/${collection}`, {method: 'POST', body: payload});
}

const uploaded = new Map();
const mimeExtension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif'};
async function ensureAsset(image) {
  if (!image?.local_path) return null;
  if (uploaded.has(image.sha256)) return uploaded.get(image.sha256);
  const title = `Carolina A · ${image.sha256.slice(0, 12)} · ${image.alt || basename(image.local_path)}`.slice(0, 255);
  const existing = await api(`/files?filter[title][_eq]=${encodeURIComponent(title)}&limit=1&fields=id`);
  if (existing[0]) {
    uploaded.set(image.sha256, existing[0].id);
    return existing[0].id;
  }
  const path = resolve(ROOT, 'source-freeze', image.local_path);
  await stat(path);
  const bytes = await readFile(path);
  const extension = mimeExtension[image.content_type] || 'bin';
  const form = new FormData();
  form.append('title', title);
  form.append('folder', ASSET_FOLDER);
  form.append('file', new Blob([bytes], {type: image.content_type || 'application/octet-stream'}), `carolina-${image.sha256.slice(0, 12)}.${extension}`);
  const file = await api('/files', {method: 'POST', body: form});
  uploaded.set(image.sha256, file.id);
  await upsert('pearl_media_assets', 'internal_name', `Carolina A · ${image.sha256.slice(0, 12)}`, {
    status: 'published', internal_name: `Carolina A · ${image.sha256.slice(0, 12)}`,
    source_url: image.source_url, file: file.id, alt_text: image.alt || '',
  });
  return file.id;
}

async function canonicalIcon(filename) {
  const row = (await api(`/files?filter[filename_download][_eq]=${encodeURIComponent(filename)}&limit=1&fields=id`))[0];
  if (!row) throw new Error(`Canonical Pearl icon is missing: ${filename}`);
  return row.id;
}

async function prepareRecord(spec, internalName, sourceItem) {
  const item = structuredClone(sourceItem);
  const fields = spec.field_contract?.fields || [];
  for (const field of fields.filter(field => field.file)) {
    if (item[field.name]?.local_path) item[field.name] = await ensureAsset(item[field.name]);
  }
  const childrenSpec = spec.field_contract?.children;
  const children = childrenSpec ? item[childrenSpec.alias] || [] : [];
  if (childrenSpec) delete item[childrenSpec.alias];
  const parent = await upsert(spec.collection_name, 'internal_name', internalName, {...item, status: 'published', internal_name: internalName});
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
    for (const stale of existing.filter(row => !used.has(row.id))) await api(`/items/${childrenSpec.collection}/${stale.id}`, {method: 'DELETE'});
  }
  return {collection: spec.collection_name, item: parent.id};
}

async function prepareBlock(page, index, block) {
  const spec = contract.get(block.type);
  if (!spec) throw new Error(`Unknown official block: ${block.type}`);
  return prepareRecord(spec, `Carolina A · ${page.slug} · ${String(index + 1).padStart(2, '0')} · ${block.type}`, block.item);
}

async function bindPage(page, site, blocks) {
  const record = await upsert('pearl_pages', 'slug', page.slug, {
    status: 'published', internal_name: `Carolina Comfort · ${page.slug}`, site: site.id, slug: page.slug,
    title: page.h1, meta_description: page.meta_description || page.title,
    workflow_status: 'approved', approval_notes: 'Baseline A deterministic migration from frozen source.',
    approved_at: new Date().toISOString(), robots_index: false, robots_follow: false,
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
  for (const stale of rows.filter(row => !used.has(row.id))) await api(`/items/pearl_page_builder/${stale.id}`, {method: 'DELETE'});
  return {id: record.id, slug: record.slug, blocks: prepared.map(item => item.collection)};
}

const site = await upsert('pearl_sites', 'slug', 'carolina-comfort', {
  status: 'published', internal_name: 'Carolina Comfort Dental · Baseline A', name: 'Carolina Comfort Dental', slug: 'carolina-comfort',
  preview_url: `${REVIEW}/`, phone: '(910) 485-0023', email: 'info@carolinacomfortdental.com',
  address: '5511 Raeford Road, Suite 225, Fayetteville, North Carolina 28304',
});

await api('/items/pearl_theme_settings', {method: 'PATCH', body: {
  status: 'published', brand_name: 'Carolina Comfort', brand_descriptor: 'Dental', heading_font: 'jost', body_font: 'jost',
  h1_weight: 500, h2_weight: 500, h3_weight: 600, body_weight: 400, heading_scale: 'standard', body_scale: 'standard',
  heading_line_height: 'standard', body_line_height: 'standard', primary_color: '#007a5e', secondary_color: '#daf2ec',
  accent_color: '#2f4943', surface_color: '#ffffff', ink_color: '#111111', muted_color: '#53606d', circle_color: '#2f4943',
  spacing_scale: 'standard', content_width: 'standard', button_radius: 'soft', phone: '(910) 485-0023',
  email: 'info@carolinacomfortdental.com', address: '5511 Raeford Road, Suite 225, Fayetteville, North Carolina 28304',
  appointment_label: 'Request an Appointment', appointment_url: 'https://link.carolinacomfortdental.com/widget/form/cZxPZ4aOwEFKp6bmvWzC',
}});

const iconIds = await Promise.all([
  canonicalIcon('pearl-icon-preventative.svg'), canonicalIcon('pearl-icon-implant.svg'),
  canonicalIcon('pearl-icon-invisalign.svg'), canonicalIcon('pearl-icon-emergency.svg'),
]);
const home = pages.find(page => page.slug === 'home');
const services = pages.filter(page => page.slug.startsWith('services-'));
const preferred = [
  'services-family-dentistry', 'services-cosmetic-dentistry',
  'services-family-dentistry-children-dentistry', 'services-family-dentistry-emergency-dentistry',
].map(slug => pages.find(page => page.slug === slug)).filter(Boolean);
const welcome = section(home, 'Treating You Like Family');
const doctor = section(home, 'Meet Dr');
const quote = home.testimonials[0];
const homeBlocks = [
  {type: 'main_hero_standard', item: {
    heading: home.hero_heading, supporting_text: home.hero_supporting || home.h1,
    background_image: selectImage(home, 'staff|team|hero'), primary_cta_label: home.cta?.label || 'Schedule Your Appointment',
    primary_cta_url: home.cta?.url || 'tel:910-485-0023',
  }},
  {type: 'icon_feature_cards', item: {
    section_heading: home.h1, intro_text: 'Family-Oriented Care · Comprehensive Services · Same-Day Solutions', display_variant: 'overlay',
    items: preferred.slice(0, 4).map((page, index) => ({icon: iconIds[index % iconIds.length], title: cleanLabel(page), url: previewPath(page.slug), sort: index + 1})),
  }},
  {type: 'feature_image_content', item: {
    heading: welcome?.heading || 'Treating You Like Family', body: welcome?.body_html || home.intro_html,
    image: selectImage(home, 'desktop|office|staff', 1), image_alt: selectImage(home, 'desktop|office|staff', 1)?.alt || 'Carolina Comfort Dental team',
    image_position: 'left', cta_label: 'How We Are Different', cta_url: previewPath('about-difference'),
  }},
  {type: 'icon_feature_cards', item: {
    section_heading: 'Put Your Best Smile Forward', intro_text: 'Explore family and cosmetic dental care from the frozen source estate.', display_variant: 'services',
    items: services.slice(0, 8).map((page, index) => ({icon: iconIds[index % iconIds.length], title: cleanLabel(page), url: previewPath(page.slug), sort: index + 1})),
  }},
  {type: 'highlight_snippet_quote', item: {
    quote: `<p>${quote?.quote || 'Every visit has been nothing but professional and helpful.'}</p>`, attribution: quote?.attribution || '', tone: 'dark',
  }},
  {type: 'feature_image_content', item: {
    heading: doctor?.heading || 'Meet Dr. Tan Binh Nguyen', body: doctor?.body_html || home.intro_html,
    image: selectImage(home, 'dr[.-]?nguyen|doctor|headshot', 4), image_alt: selectImage(home, 'dr[.-]?nguyen|doctor|headshot', 4)?.alt || 'Dr. Tan Binh Nguyen',
    image_position: 'right', cta_label: 'Meet Our Team', cta_url: previewPath('about'),
  }},
  {type: 'contact_info_standard', item: {
    heading: 'Visit Carolina Comfort Dental', address: '5511 Raeford Road, Suite 225, Fayetteville, North Carolina 28304',
    phone: '(910) 485-0023', email: 'info@carolinacomfortdental.com',
    map_url: 'https://www.google.com/maps/search/?api=1&query=5511+Raeford+Road+Suite+225+Fayetteville+NC+28304',
  }},
];
if (homeBlocks.map(block => contract.get(block.type).collection_name).join(',') !== HOME_SEQUENCE.join(',')) throw new Error('Generated homepage does not match the frozen seven-block sequence');

const importedPages = [];
importedPages.push(await bindPage(home, site, homeBlocks));
for (const page of pages.filter(item => item.slug !== 'home')) {
  const image = selectImage(page, 'patient|dentist|smile|office|dental', 0);
  const blocks = [{type: 'inner_hero_standard', item: {
    page_title: page.h1, intro_paragraph: page.intro_html || `<p>${page.meta_description || page.h1}</p>`,
    featured_image: image, image_alt: image?.alt || '',
  }}];
  if (page.sections.length) {
    for (const [index, content] of page.sections.entries()) {
      blocks.push({type: 'flex_content_section', item: {
        section_header: content.heading, body_content: content.body_html || `<p>${content.heading}</p>`,
        image: index === 0 ? image : null, image_alt: index === 0 ? image?.alt || '' : '', image_position: index % 2 ? 'left' : 'right', header_tag: 'h2',
      }});
    }
  } else {
    blocks.push({type: 'flex_content_section', item: {body_content: sourceBody(page), header_tag: 'h2', image_position: 'right'}});
  }
  if (page.slug === 'services') {
    blocks.push({type: 'highlight_links', item: {
      section_heading: 'Dental Services',
      links: services.map((service, index) => ({link_label: cleanLabel(service), link_url: previewPath(service.slug), sort: index + 1})),
    }});
  }
  if (page.slug === 'about-our-office' && page.images.filter(item => item.local_path).length >= 3) {
    blocks.push({type: 'image_gallery_grid', item: {
      section_heading: 'Our Dental Office', grid_columns: 3,
      images: page.images.filter(item => item.local_path).slice(0, 9).map((image, index) => ({image, image_alt: image.alt || 'Carolina Comfort Dental office', sort: index + 1})),
    }});
  }
  if (page.slug === 'contact-us') {
    blocks.push({type: 'contact_info_standard', item: {
      heading: 'Contact Carolina Comfort Dental', address: '5511 Raeford Road, Suite 225, Fayetteville, North Carolina 28304',
      phone: '(910) 485-0023', email: 'info@carolinacomfortdental.com',
      map_url: 'https://www.google.com/maps/search/?api=1&query=5511+Raeford+Road+Suite+225+Fayetteville+NC+28304',
    }});
  }
  if (page.cta) {
    blocks.push({type: 'cta_section_standard', item: {
      heading: page.cta.label, body: `<p>${page.meta_description || page.h1}</p>`, cta_label: page.cta.label, cta_url: page.cta.url,
    }});
  }
  importedPages.push(await bindPage(page, site, blocks));
}

const navigation = [
  ['Home', 'home'], ['Our Office', 'about'], ['Services', 'services'], ['New Patients', 'new-patients'], ['Contact', 'contact-us'],
];
for (const [index, [label, slug]] of navigation.entries()) {
  await upsert('pearl_navigation_items', 'internal_name', `Carolina A · navigation · ${index + 1}`, {
    status: 'published', internal_name: `Carolina A · navigation · ${index + 1}`, site: site.id, label, url: previewPath(slug), sort: index + 1,
  });
}
const formUrl = exceptions.flatMap(item => item.urls || []).find(url => url.includes('link.carolinacomfortdental.com/widget/form'));
if (formUrl) await upsert('pearl_forms', 'internal_name', 'Carolina A · GHL appointment form', {
  status: 'published', internal_name: 'Carolina A · GHL appointment form', name: 'Appointment Request', provider: 'GoHighLevel', embed_url: formUrl,
});

const completedAt = new Date().toISOString();
await upsert('pearl_migration_runs', 'internal_name', 'Carolina Comfort · Baseline A', {
  status: 'published', internal_name: 'Carolina Comfort · Baseline A', source_url: mappingReceipt.source,
  started_at: startedAt, completed_at: completedAt,
  summary: {...mappingReceipt, imported_pages: importedPages.length, uploaded_assets: uploaded.size, exception_detail: exceptions},
});

const actualHome = importedPages.find(page => page.slug === 'home').blocks;
const receipt = {
  ok: true,
  baseline: 'A',
  target: BASE,
  source_pages: pages.length,
  imported_pages: importedPages.length,
  uploaded_assets: uploaded.size,
  homepage_blocks: actualHome,
  homepage_frozen: actualHome.join(',') === HOME_SEQUENCE.join(','),
  inner_pages: importedPages.filter(page => page.slug !== 'home').length,
  exceptions: exceptions.length,
  started_at: startedAt,
  completed_at: completedAt,
};
await mkdir(resolve(ROOT, 'receipts'), {recursive: true});
await writeFile(resolve(ROOT, 'receipts/directus-import.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
