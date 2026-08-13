#!/usr/bin/env node
const BASE = (process.env.PEARL_DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai').replace(/\/$/, '');
const TOKEN = process.env.PEARL_DIRECTUS_TOKEN;
if (!TOKEN) throw new Error('PEARL_DIRECTUS_TOKEN is required');

async function request(path, expected = 200) {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
  if (response.status !== expected) throw new Error(`${path} returned ${response.status}, expected ${expected}`);
  return response.json().catch(() => ({}));
}

const page = (await request('/items/weo_pearl_pages?filter[slug][_eq]=pearl-component-workshop&fields=id,slug,status,robots_index,robots_follow&limit=1')).data[0];
if (!page || page.status !== 'published' || page.robots_index !== false || page.robots_follow !== false) {
  throw new Error('Canonical Pearl page is missing, unpublished or indexable');
}
const theme = (await request('/items/weo_pearl_theme_settings?fields=status,heading_font,body_font,h1_weight,h2_weight,h3_weight,primary_color,secondary_color,spacing_scale,content_width')).data;
if (!theme || theme.status !== 'published' || !theme.heading_font || !theme.body_font || !theme.primary_color || !theme.secondary_color) {
  throw new Error('Published Pearl Theme Library is missing or incomplete');
}
const rows = (await request('/items/weo_pearl_page_builder?filter[page][_eq]=' + page.id + '&fields=id,sort,collection,item&sort=sort&limit=-1')).data;
const expected = [
  'weo_pearl_main_heroes', 'weo_pearl_icon_circles', 'weo_pearl_flex_content_images',
  'weo_pearl_split_image_contents', 'weo_pearl_patient_reviews', 'weo_pearl_areas_served',
  'weo_pearl_highlight_quotes', 'weo_pearl_content_images', 'weo_pearl_inner_hero_ctas',
];
if (rows.length !== expected.length || rows.some((row, index) => row.collection !== expected[index] || row.sort !== index + 1 || !row.item)) {
  throw new Error('Canonical Pearl Builder composition is incomplete or out of order');
}
await request('/items/weo_pages?limit=1', 403);
console.log(JSON.stringify({ ok: true, target: BASE, page: page.slug, blocks: rows.length, uniqueBlockTypes: new Set(rows.map((row) => row.collection)).size, themeLibrary: true, jeffreyPagesDenied: true }, null, 2));
