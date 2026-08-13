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
const library = (await request('/items/pearl_block_library?limit=-1&fields=key,name,status')).data;
if (library.length !== 14 || library.some(item => item.status !== 'published')) throw new Error(`Official Pearl Block Library expected 14 published definitions, received ${library.length}`);
const rows = (await request(`/items/pearl_page_builder?filter[page][_eq]=${page.id}&fields=id,sort,collection,item&sort=sort&limit=-1`)).data;
const expected = [
  'pearl_main_hero_standard',
  'pearl_icon_feature_cards',
  'pearl_feature_image_content',
  'pearl_icon_feature_cards',
  'pearl_highlight_snippet_quote',
  'pearl_feature_image_content',
  'pearl_contact_info_standard',
];
if (JSON.stringify(rows.map(row => row.collection)) !== JSON.stringify(expected)) throw new Error(`Pearl official component sequence mismatch: ${rows.map(row => row.collection).join(', ')}`);
const denied = await fetch(`${base}/items/directus_users`, {headers: {Authorization: `Bearer ${token}`}});
if (denied.status !== 403) throw new Error(`Pearl build reader unexpectedly accessed users (${denied.status})`);

console.log(JSON.stringify({ok:true,base,page:page.slug,official_block_definitions:library.length,homepage_blocks:rows.length,noindex:true,build_reader_isolated:true},null,2));
