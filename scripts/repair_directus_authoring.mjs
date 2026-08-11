#!/usr/bin/env node
/** Restore the clean WEO master to the native authoring contract.
 *
 * Dry-run by default. Pass --apply to create the native M2A Page Content
 * Builder, the missing embed/form component types, provenance fields, legacy
 * compatibility relations, permissions and the organised editor workspace.
 */

const BASE = (process.env.DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai').replace(/\/$/, '');
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? 'jason@foundryworks.ai';
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD;
const APPLY = process.argv.includes('--apply');
if (!PASSWORD) throw new Error('DIRECTUS_ADMIN_PASSWORD is required');

async function raw(path, {method = 'GET', body, token} = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);
  return payload.data;
}

const login = await raw('/auth/login', {method: 'POST', body: {email: EMAIL, password: PASSWORD}});
const token = login.access_token;
const api = (path, options = {}) => raw(path, {...options, token});
const actions = [];
const label = (translation) => [{language: 'en-US', translation}];

async function getField(collection, field) {
  const response = await fetch(`${BASE}/fields/${collection}/${field}`, {headers: {Authorization: `Bearer ${token}`}});
  if (response.status === 403 || response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GET field ${collection}.${field} -> ${response.status}`);
  return payload.data;
}

async function ensureCollection(collection, meta, fields = []) {
  const all = await api('/collections?limit=-1');
  const current = all.find((entry) => entry.collection === collection);
  actions.push({target: collection, action: current ? 'update_collection' : 'create_collection'});
  if (!APPLY) return;
  if (!current) {
    await api('/collections', {method: 'POST', body: {collection, meta, schema: {}, fields}});
  } else {
    await api(`/collections/${collection}`, {method: 'PATCH', body: {meta: {...current.meta, ...meta}}});
  }
}

async function ensureField(collection, definition) {
  const current = await getField(collection, definition.field);
  actions.push({target: `${collection}.${definition.field}`, action: current ? 'update_field' : 'create_field'});
  if (!APPLY) return;
  if (!current) {
    await api(`/fields/${collection}`, {method: 'POST', body: definition});
  } else if (definition.meta) {
    await api(`/fields/${collection}/${definition.field}`, {
      method: 'PATCH', body: {meta: {...current.meta, ...definition.meta}},
    });
  }
}

async function ensureRelation(definition) {
  const relations = await api('/relations?limit=-1');
  const current = relations.find((entry) => entry.collection === definition.collection && entry.field === definition.field);
  actions.push({target: `${definition.collection}.${definition.field}`, action: current ? 'update_relation' : 'create_relation'});
  if (!APPLY) return;
  if (!current) await api('/relations', {method: 'POST', body: definition});
  else if (definition.meta) {
    await api(`/relations/${definition.collection}/${definition.field}`, {
      method: 'PATCH', body: {meta: {...current.meta, ...definition.meta}},
    });
  }
}

const statusField = {
  field: 'status', type: 'string',
  meta: {interface: 'select-dropdown', options: {choices: [
    {text: 'Draft', value: 'draft'}, {text: 'Published', value: 'published'},
  ]}},
  schema: {is_nullable: false, max_length: 20, default_value: 'draft'},
};
const uuidId = {field: 'id', type: 'uuid', meta: {special: ['uuid'], interface: 'input', hidden: true, readonly: true}, schema: {is_primary_key: true, is_nullable: false}};

await ensureCollection('weo_component_embeds', {
  icon: 'smart_display', display_template: '{{internal_name}} — {{provider}}', translations: label('Embeds'),
  note: 'Structured video and media embeds. The captured source fragment is hidden provenance.',
}, [uuidId, statusField]);
await ensureCollection('weo_component_forms', {
  icon: 'contact_page', display_template: '{{internal_name}} — {{heading}}', translations: label('Form Sections'),
  note: 'Structured page-level form presentation linked to a governed provider form.',
}, [uuidId, statusField]);

const commonComponentFields = [
  {field: 'internal_name', type: 'string', meta: {interface: 'input', translations: label('Editor Label')}, schema: {is_nullable: true, max_length: 255}},
  {field: 'heading', type: 'string', meta: {interface: 'input'}, schema: {is_nullable: true, max_length: 255}},
  {field: 'source_html', type: 'text', meta: {interface: 'input-code', hidden: true, readonly: true, note: 'Immutable source-fidelity fragment; editors use the structured fields above.'}, schema: {is_nullable: true}},
];
for (const definition of commonComponentFields) {
  await ensureField('weo_component_embeds', definition);
  await ensureField('weo_component_forms', definition);
}
for (const definition of [
  {field: 'provider', type: 'string', meta: {interface: 'input'}, schema: {is_nullable: true, max_length: 255}},
  {field: 'embed_url', type: 'string', meta: {interface: 'input', translations: label('Embed URL')}, schema: {is_nullable: true, max_length: 2048}},
]) await ensureField('weo_component_embeds', definition);
for (const definition of [
  {field: 'form_name', type: 'string', meta: {interface: 'input', translations: label('Form Name')}, schema: {is_nullable: true, max_length: 255}},
  {field: 'provider', type: 'string', meta: {interface: 'input'}, schema: {is_nullable: true, max_length: 255}},
  {field: 'external_id', type: 'string', meta: {interface: 'input'}, schema: {is_nullable: true, max_length: 255}},
  {field: 'source_action', type: 'string', meta: {interface: 'input', hidden: true, readonly: true}, schema: {is_nullable: true, max_length: 2048}},
]) await ensureField('weo_component_forms', definition);

const sourceCollections = [
  'weo_component_heroes', 'weo_component_text_media', 'weo_component_feature_grids',
  'weo_component_ctas', 'weo_component_testimonials', 'weo_component_team_grids',
];
for (const collection of sourceCollections) {
  await ensureField(collection, {
    field: 'source_html', type: 'text',
    meta: {interface: 'input-code', hidden: true, readonly: true, note: 'Immutable source-fidelity fragment; edit the structured fields.'},
    schema: {is_nullable: true},
  });
}
await ensureField('weo_component_text_media', {
  field: 'body_html', type: 'text',
  meta: {interface: 'input-rich-text-html', width: 'full', translations: label('Body'), note: 'Rich text is reserved for flexible narrative content.'},
  schema: {is_nullable: true},
});
await ensureField('weo_component_feature_grids', {
  field: 'variant', type: 'string', meta: {interface: 'select-dropdown', options: {choices: [
    {text: 'Primary links with introduction', value: 'primary-with-intro'},
    {text: 'Service links', value: 'services'},
  ]}}, schema: {is_nullable: true, max_length: 255},
});
for (const definition of [
  {field: 'link_label', type: 'string', meta: {interface: 'input'}, schema: {is_nullable: true, max_length: 255}},
  {field: 'link_url', type: 'string', meta: {interface: 'input'}, schema: {is_nullable: true, max_length: 2048}},
  {field: 'icon_svg', type: 'text', meta: {interface: 'input-code', hidden: true, readonly: true, note: 'Captured source icon; retained as provenance.'}, schema: {is_nullable: true}},
]) await ensureField('weo_component_feature_items', definition);

for (const [field, related] of [['embed', 'weo_component_embeds'], ['form', 'weo_component_forms']]) {
  await ensureField('weo_page_blocks', {
    field, type: 'uuid', meta: {special: ['m2o'], interface: 'select-dropdown-m2o'}, schema: {is_nullable: true},
  });
  await ensureRelation({collection: 'weo_page_blocks', field, related_collection: related, meta: {one_deselect_action: 'nullify'}});
}

const components = {
  hero: 'weo_component_heroes', text_media: 'weo_component_text_media', feature_grid: 'weo_component_feature_grids',
  process: 'weo_component_processes', faq: 'weo_component_faqs', cta: 'weo_component_ctas',
  testimonials: 'weo_component_testimonials', stats: 'weo_component_stats', gallery: 'weo_component_galleries',
  team_grid: 'weo_component_team_grids', embed: 'weo_component_embeds', form: 'weo_component_forms',
};
const allowed = Object.values(components);
await ensureCollection('weo_page_builder', {
  hidden: true, icon: 'account_tree', display_template: '{{sort}} · {{collection}}',
  note: 'Native Directus Builder junction. Edit through Pages → Page Content.',
}, [uuidId]);
await ensureField('weo_pages', {
  field: 'content', type: 'alias', meta: {
    special: ['m2a'], interface: 'list-m2a', display: 'related-values', width: 'full', sort: 4,
    hidden: false, options: {enableCreate: true, enableSelect: true, allowDuplicates: false},
    translations: label('Page Content'), note: 'Add, edit and reorder structured components. Nested cards, quotes and people stay inside their parent block.',
  },
});
for (const definition of [
  {field: 'page', type: 'uuid', meta: {special: ['m2o'], interface: 'select-dropdown-m2o', hidden: true}, schema: {is_nullable: false}},
  {field: 'item', type: 'string', meta: {interface: 'input', hidden: true}, schema: {is_nullable: false, max_length: 255}},
  {field: 'collection', type: 'string', meta: {interface: 'input', hidden: true}, schema: {is_nullable: false, max_length: 255}},
  {field: 'sort', type: 'integer', meta: {interface: 'input', hidden: true}, schema: {is_nullable: true}},
]) await ensureField('weo_page_builder', definition);
await ensureRelation({collection: 'weo_page_builder', field: 'item', related_collection: null, meta: {one_allowed_collections: allowed, one_collection_field: 'collection', junction_field: 'page'}});
await ensureRelation({collection: 'weo_page_builder', field: 'page', related_collection: 'weo_pages', meta: {one_field: 'content', junction_field: 'item', sort_field: 'sort', one_deselect_action: 'delete'}, schema: {on_delete: 'CASCADE'}});

const groups = [
  ['weo_editorial', 'Website Content', 'edit_note', 1],
  ['weo_blocks', 'Page Components', 'view_quilt', 2],
  ['weo_operations', 'Operations & Evidence', 'rule', 3],
];
for (const [collection, translation, icon, sort] of groups) {
  const current = (await api('/collections?limit=-1')).find((entry) => entry.collection === collection);
  actions.push({target: collection, action: current ? 'update_folder' : 'create_folder'});
  if (APPLY) {
    const meta = {type: 'folder', icon, sort, translations: label(translation)};
    if (current) await api(`/collections/${collection}`, {method: 'PATCH', body: {meta: {...current.meta, ...meta}}});
    else await api('/collections', {method: 'POST', body: {collection, meta, schema: null}});
  }
}

const presentation = [
  ['weo_pages', 'Pages', 'weo_editorial', 1, false, 'web'],
  ['weo_sites', 'Site Settings', 'weo_editorial', 2, false, 'settings'],
  ['weo_navigation_items', 'Navigation', 'weo_editorial', 3, false, 'account_tree'],
  ['weo_forms', 'Forms', 'weo_editorial', 4, false, 'dynamic_form'],
  ['weo_posts', 'CMS Articles', 'weo_editorial', 5, false, 'article'],
  ['weo_component_heroes', 'Hero', 'weo_blocks', 1, false, 'web_asset'],
  ['weo_component_text_media', 'Text + Media', 'weo_blocks', 2, false, 'art_track'],
  ['weo_component_feature_grids', 'Feature Grids', 'weo_blocks', 3, false, 'grid_view'],
  ['weo_component_processes', 'Processes', 'weo_blocks', 4, false, 'format_list_numbered'],
  ['weo_component_faqs', 'FAQs', 'weo_blocks', 5, false, 'quiz'],
  ['weo_component_ctas', 'Calls to Action', 'weo_blocks', 6, false, 'campaign'],
  ['weo_component_testimonials', 'Testimonials', 'weo_blocks', 7, false, 'format_quote'],
  ['weo_component_team_grids', 'Team Grids', 'weo_blocks', 8, false, 'groups'],
  ['weo_component_galleries', 'Galleries', 'weo_blocks', 9, false, 'photo_library'],
  ['weo_component_stats', 'Stats', 'weo_blocks', 10, false, 'monitoring'],
  ['weo_component_embeds', 'Embeds', 'weo_blocks', 11, false, 'smart_display'],
  ['weo_component_forms', 'Form Sections', 'weo_blocks', 12, false, 'contact_page'],
  ['weo_component_feature_items', 'Feature Items', 'weo_blocks', 20, true, 'check_circle'],
  ['weo_component_process_steps', 'Process Steps', 'weo_blocks', 21, true, 'format_list_numbered'],
  ['weo_component_faq_items', 'FAQ Questions', 'weo_blocks', 22, true, 'question_answer'],
  ['weo_component_testimonial_items', 'Testimonial Items', 'weo_blocks', 23, true, 'reviews'],
  ['weo_component_team_members', 'Team Members', 'weo_blocks', 24, true, 'person'],
  ['weo_component_gallery_items', 'Gallery Images', 'weo_blocks', 25, true, 'image'],
  ['weo_component_stat_items', 'Stat Items', 'weo_blocks', 26, true, 'data_usage'],
  ['weo_form_submissions', 'Form Submissions', 'weo_operations', 1, false, 'inbox'],
  ['weo_redirects', 'Redirects', 'weo_operations', 2, false, 'alt_route'],
  ['weo_internal_links', 'Internal Links', 'weo_operations', 3, false, 'link'],
  ['weo_page_templates', 'Page Templates', 'weo_operations', 4, true, 'dashboard_customize'],
  ['weo_page_template_blocks', 'Template Blocks', 'weo_operations', 5, true, 'view_module'],
  ['weo_media_assets', 'Migration Media Inventory', 'weo_operations', 10, true, 'inventory_2'],
  ['weo_migration_runs', 'Migration Runs', 'weo_operations', 11, true, 'conversion_path'],
  ['weo_page_builder', 'Page Builder Relations', 'weo_operations', 90, true, 'account_tree'],
  ['weo_page_blocks', 'Legacy Page Blocks', 'weo_operations', 91, true, 'history'],
  ['weo_page_sections', 'Legacy Page Sections', 'weo_operations', 92, true, 'history'],
];
const allCollections = new Map((await api('/collections?limit=-1')).map((entry) => [entry.collection, entry]));
for (const [collection, translation, group, sort, hidden, icon] of presentation) {
  const current = allCollections.get(collection);
  if (!current) continue;
  actions.push({target: collection, action: 'organise_collection'});
  if (APPLY) await api(`/collections/${collection}`, {method: 'PATCH', body: {meta: {...current.meta, group, sort, hidden, icon, translations: label(translation)}}});
}
for (const [field, translation] of [['content_sections', 'Legacy Page Sections'], ['structured_blocks', 'Legacy Page Blocks']]) {
  const current = await getField('weo_pages', field);
  actions.push({target: `weo_pages.${field}`, action: 'hide_legacy_editor_path'});
  if (APPLY && current) await api(`/fields/weo_pages/${field}`, {method: 'PATCH', body: {meta: {...current.meta, hidden: true, readonly: true, translations: label(translation)}}});
}
const paragraphs = await getField('weo_component_text_media', 'paragraphs');
if (APPLY && paragraphs) await api('/fields/weo_component_text_media/paragraphs', {method: 'PATCH', body: {meta: {...paragraphs.meta, hidden: true, readonly: true, translations: label('Legacy Paragraphs')}}});

if (APPLY) {
  const allPermissions = await api('/permissions?limit=-1');
  for (const [source, destination] of [['weo_page_blocks', 'weo_page_builder'], ['weo_component_text_media', 'weo_component_embeds'], ['weo_component_text_media', 'weo_component_forms']]) {
    for (const permission of allPermissions.filter((entry) => entry.collection === source)) {
      const current = allPermissions.find((entry) => entry.policy === permission.policy && entry.collection === destination && entry.action === permission.action);
      const body = {policy: permission.policy, collection: destination, action: permission.action, permissions: permission.permissions ?? {}, validation: permission.validation, presets: permission.presets, fields: ['*']};
      if (current) await api(`/permissions/${current.id}`, {method: 'PATCH', body});
      else await api('/permissions', {method: 'POST', body});
    }
  }

  const legacyRows = await api(`/items/weo_page_blocks?limit=-1&sort=page,sort&fields=id,page,sort,component_type,${Object.keys(components).join(',')}`);
  const currentRows = await api('/items/weo_page_builder?limit=-1&fields=id');
  const currentIds = new Set(currentRows.map((row) => row.id));
  for (const row of legacyRows) {
    const collection = components[row.component_type];
    const item = row[row.component_type];
    if (!collection || !item || currentIds.has(row.id)) continue;
    await api('/items/weo_page_builder', {method: 'POST', body: {id: row.id, page: row.page, sort: row.sort, collection, item}});
  }
}

console.log(JSON.stringify({ok: true, mode: APPLY ? 'apply' : 'dry-run', actions: actions.length}, null, 2));
