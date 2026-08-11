#!/usr/bin/env node
/** Blocking acceptance gate for the native Directus authoring contract. */

const BASE = (process.env.DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai').replace(/\/$/, '');
const BUILD_TOKEN = process.env.DIRECTUS_BUILD_TOKEN ?? process.env.DIRECTUS_SERVER_TOKEN;
const ADMIN_PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? 'jason@foundryworks.ai';
const SITE_SLUG = process.env.DIRECTUS_SITE_SLUG ?? 'jeffrey-carl-dmd';
if (!BUILD_TOKEN) throw new Error('DIRECTUS_BUILD_TOKEN or DIRECTUS_SERVER_TOKEN is required');

async function request(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.body ? {'Content-Type': 'application/json'} : {})},
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);
  return payload.data;
}

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const sites = await request(`/items/weo_sites?filter[slug][_eq]=${encodeURIComponent(SITE_SLUG)}&limit=1&fields=id,indexing_enabled`, BUILD_TOKEN);
const site = sites[0];
check(Boolean(site), `site missing: ${SITE_SLUG}`);
if (!site) throw new Error(failures.join('; '));
check(site.indexing_enabled === false, 'review site indexing must remain disabled');

const pages = await request(`/items/weo_pages?filter[site][_eq]=${site.id}&limit=-1&fields=id,legacy_path,robots_index,robots_follow`, BUILD_TOKEN);
check(pages.length === 78, `expected 78 pages, received ${pages.length}`);
check(pages.every((page) => !page.robots_index && !page.robots_follow), 'all pages must remain noindex,nofollow');

const fields = [
  'id', 'page', 'sort', 'collection',
  'item:weo_component_heroes.*', 'item:weo_component_text_media.*',
  'item:weo_component_feature_grids.*', 'item:weo_component_feature_grids.items.*',
  'item:weo_component_processes.*', 'item:weo_component_processes.steps.*',
  'item:weo_component_faqs.*', 'item:weo_component_faqs.items.*',
  'item:weo_component_ctas.*',
  'item:weo_component_testimonials.*', 'item:weo_component_testimonials.items.*',
  'item:weo_component_stats.*',
  'item:weo_component_galleries.*', 'item:weo_component_galleries.items.*',
  'item:weo_component_team_grids.*', 'item:weo_component_team_grids.members.*',
  'item:weo_component_embeds.*', 'item:weo_component_forms.*',
];
const rows = await request(`/items/weo_page_builder?filter[page][site][_eq]=${site.id}&limit=-1&sort=page,sort&fields=${fields.join(',')}`, BUILD_TOKEN);
check(rows.length === 508, `expected 508 native Builder rows, received ${rows.length}`);
check(rows.every((row) => row.item && typeof row.item === 'object'), 'build policy must resolve every polymorphic Builder item');
const counts = {};
for (const row of rows) counts[row.collection] = (counts[row.collection] ?? 0) + 1;
const expected = {
  weo_component_heroes: 44,
  weo_component_text_media: 360,
  weo_component_ctas: 9,
  weo_component_embeds: 10,
  weo_component_feature_grids: 42,
  weo_component_testimonials: 21,
  weo_component_team_grids: 21,
  weo_component_forms: 1,
};
check(
  Object.keys(expected).length === Object.keys(counts).length
    && Object.entries(expected).every(([collection, count]) => counts[collection] === count),
  `semantic component distribution mismatch: ${JSON.stringify(counts)}`,
);
const featureItems = rows.filter((row) => row.collection === 'weo_component_feature_grids').reduce((sum, row) => sum + (row.item.items?.length ?? 0), 0);
const testimonialItems = rows.filter((row) => row.collection === 'weo_component_testimonials').reduce((sum, row) => sum + (row.item.items?.length ?? 0), 0);
const teamMembers = rows.filter((row) => row.collection === 'weo_component_team_grids').reduce((sum, row) => sum + (row.item.members?.length ?? 0), 0);
check(featureItems === 168, `expected 168 nested feature items, received ${featureItems}`);
check(testimonialItems === 21, `expected 21 nested testimonials, received ${testimonialItems}`);
check(teamMembers === 42, `expected 42 nested team members, received ${teamMembers}`);

if (ADMIN_PASSWORD) {
  const loginResponse = await fetch(`${BASE}/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: ADMIN_EMAIL, password: ADMIN_PASSWORD})});
  const loginPayload = await loginResponse.json();
  if (!loginResponse.ok) throw new Error('Directus admin login failed');
  const adminToken = loginPayload.data.access_token;
  const collections = new Map((await request('/collections?limit=-1', adminToken)).map((entry) => [entry.collection, entry]));
  for (const folder of ['weo_editorial', 'weo_blocks', 'weo_operations']) check(collections.has(folder), `editor folder missing: ${folder}`);
  check(collections.get('weo_pages')?.meta?.group === 'weo_editorial', 'Pages must be grouped under Website Content');
  check(collections.get('weo_component_feature_grids')?.meta?.group === 'weo_blocks', 'Feature Grids must be grouped under Page Components');
  const pageFields = new Map((await request('/fields/weo_pages', adminToken)).map((field) => [field.field, field]));
  check(pageFields.get('content')?.meta?.special?.includes('m2a'), 'Pages.content must be the native M2A Builder');
  check(pageFields.get('content')?.meta?.hidden === false, 'native Page Content Builder must be visible');
  check(pageFields.get('structured_blocks')?.meta?.hidden === true, 'legacy structured_blocks path must be hidden');
  check(pageFields.get('content_sections')?.meta?.hidden === true, 'legacy content_sections path must be hidden');
  const textFields = new Map((await request('/fields/weo_component_text_media', adminToken)).map((field) => [field.field, field]));
  check(textFields.get('body_html')?.meta?.interface === 'input-rich-text-html', 'only Text + Media must expose the rich-text body editor');
  check(textFields.get('paragraphs')?.meta?.hidden === true, 'legacy paragraph array must be hidden');
}

const receipt = {ok: failures.length === 0, site: SITE_SLUG, pages: pages.length, builder_rows: rows.length, component_counts: counts, nested: {feature_items: featureItems, testimonial_items: testimonialItems, team_members: teamMembers}, failures};
console.log(JSON.stringify(receipt, null, 2));
if (failures.length) process.exit(1);
