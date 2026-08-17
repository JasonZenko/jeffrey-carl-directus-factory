const base = (process.env.PEARL_DIRECTUS_URL ?? 'https://pearlcms.foundryworks.ai').replace(/\/$/, '');
const token = process.env.PEARL_DIRECTUS_TOKEN;
if (!token) throw new Error('PEARL_DIRECTUS_TOKEN is required');

async function request(path, expected = 200) {
  const response = await fetch(`${base}${path}`, {headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}});
  if (response.status !== expected) throw new Error(`${path} returned ${response.status}, expected ${expected}`);
  return response.json();
}

const page = (await request('/items/pearl_pages?filter[slug][_eq]=home&fields=id,slug,status,workflow_status,robots_index,robots_follow&limit=1')).data[0];
if (!page || page.status !== 'published' || page.workflow_status !== 'approved' || page.robots_index !== false || page.robots_follow !== false) throw new Error('Canonical Pearl home page is missing, unapproved, unpublished or indexable');
const theme = (await request('/items/pearl_theme_settings?fields=status,heading_font,body_font,h1_weight,h2_weight,h3_weight,primary_color,secondary_color,spacing_scale,content_width')).data;
if (!theme || theme.status !== 'published' || !theme.heading_font || !theme.body_font || !theme.primary_color || !theme.secondary_color) throw new Error('Published Pearl Theme Library is missing or incomplete');
const library = (await request('/items/pearl_block_library?limit=-1&fields=key,name,collection_name,status')).data;
if (library.length !== 14 || library.some(item => item.status !== 'published')) throw new Error(`Official Pearl Block Library expected 14 published definitions, received ${library.length}`);
const allowedCollections = new Set(library.map(item => item.collection_name));
const pages = (await request('/items/pearl_pages?filter[status][_eq]=published&filter[workflow_status][_eq]=approved&fields=id,slug,robots_index,robots_follow&limit=-1&sort=slug')).data;
if (!pages.length) throw new Error('No approved published Pearl pages found');
let homepageBlocks = 0;
for (const candidate of pages) {
  if (candidate.robots_index !== false || candidate.robots_follow !== false) throw new Error(`Pearl review page must remain noindex/nofollow: ${candidate.slug}`);
  const rows = (await request(`/items/pearl_page_builder?filter[page][_eq]=${candidate.id}&fields=id,sort,collection,item&sort=sort&limit=-1`)).data;
  if (!rows.length) throw new Error(`Pearl page has no Builder blocks: ${candidate.slug}`);
  const unknown = rows.filter(row => !allowedCollections.has(row.collection));
  if (unknown.length) throw new Error(`Pearl page ${candidate.slug} contains unofficial blocks: ${unknown.map(row => row.collection).join(', ')}`);
  if (candidate.slug === 'home') {
    homepageBlocks = rows.length;
    if (rows[0]?.collection !== 'pearl_main_hero_standard') throw new Error('Pearl home must begin with Main Hero Standard');
    if (!rows.some(row => row.collection === 'pearl_contact_info_standard')) throw new Error('Pearl home must include Contact Info Standard');
  }
}
const denied = await fetch(`${base}/items/directus_users`, {headers: {Authorization: `Bearer ${token}`}});
if (denied.status !== 403) throw new Error(`Pearl build reader unexpectedly accessed users (${denied.status})`);

console.log(JSON.stringify({ok:true,base,page:page.slug,published_pages:pages.map(item=>item.slug),official_block_definitions:library.length,homepage_blocks:homepageBlocks,noindex:true,build_reader_isolated:true},null,2));
