#!/usr/bin/env node
const BASE = (process.env.DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? 'jason@foundryworks.ai';
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD;
const STATIC_TOKEN = process.env.PEARL_BUILD_TOKEN;
const policyName = 'Pearl Template Build Read Only';
const roleName = 'Pearl Template Build';
const userEmail = 'pearl-build@foundryworks.ai';

async function raw(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
  return payload.data;
}

if (!APPLY) {
  console.log(JSON.stringify({ mode: 'dry-run', policy: policyName, role: roleName, user: userEmail, target: BASE }, null, 2));
  process.exit(0);
}
if (!PASSWORD || !STATIC_TOKEN) throw new Error('DIRECTUS_ADMIN_PASSWORD and PEARL_BUILD_TOKEN are required with --apply');
const admin = (await raw('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).access_token;
const api = (path, options = {}) => raw(path, { ...options, token: admin });

async function upsertSystem(endpoint, name, payload) {
  const rows = await api(`/${endpoint}?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`);
  if (rows[0]) return api(`/${endpoint}/${rows[0].id}`, { method: 'PATCH', body: payload });
  return api(`/${endpoint}`, { method: 'POST', body: payload });
}

const policy = await upsertSystem('policies', policyName, {
  name: policyName, icon: 'lock', description: 'Server-only read access to the published canonical Pearl template namespace.', app_access: false, admin_access: false,
});
const role = await upsertSystem('roles', roleName, {
  name: roleName, icon: 'build', description: 'Static build reader for the canonical Pearl review only.',
});
const access = await api('/access?limit=-1');
if (!access.some((entry) => entry.role === role.id && entry.policy === policy.id)) {
  await api('/access', { method: 'POST', body: { role: role.id, policy: policy.id, sort: 1 } });
}

const permissions = await api('/permissions?limit=-1');
async function ensureRead(collection, filter = {}) {
  const payload = { policy: policy.id, collection, action: 'read', permissions: filter, validation: null, presets: null, fields: ['*'] };
  const current = permissions.find((entry) => entry.policy === policy.id && entry.collection === collection && entry.action === 'read');
  if (current) await api(`/permissions/${current.id}`, { method: 'PATCH', body: payload });
  else await api('/permissions', { method: 'POST', body: payload });
}

await ensureRead('weo_pearl_pages', { status: { _eq: 'published' } });
await ensureRead('weo_pearl_theme_settings', { status: { _eq: 'published' } });
await ensureRead('weo_pearl_page_builder', { page: { status: { _eq: 'published' } } });
for (const collection of [
  'weo_pearl_main_heroes', 'weo_pearl_inner_hero_ctas', 'weo_pearl_flex_content_images',
  'weo_pearl_split_image_contents', 'weo_pearl_patient_reviews', 'weo_pearl_areas_served',
  'weo_pearl_icon_circles', 'weo_pearl_highlight_quotes', 'weo_pearl_content_images',
]) await ensureRead(collection, { status: { _eq: 'published' } });
for (const collection of ['weo_pearl_patient_review_items', 'weo_pearl_area_links', 'weo_pearl_icon_circle_items']) {
  await ensureRead(collection, { parent: { status: { _eq: 'published' } } });
}
await ensureRead('directus_files', {});
await ensureRead('directus_folders', {});

const users = await api(`/users?filter[email][_eq]=${encodeURIComponent(userEmail)}&limit=1`);
const userPayload = { email: userEmail, status: 'active', role: role.id, token: STATIC_TOKEN, first_name: 'Pearl', last_name: 'Build' };
if (users[0]) await api(`/users/${users[0].id}`, { method: 'PATCH', body: userPayload });
else await api('/users', { method: 'POST', body: userPayload });

const proof = await raw('/items/weo_pearl_pages?fields=id,slug,status&limit=1', { token: STATIC_TOKEN });
const denied = await fetch(`${BASE}/items/weo_pages?limit=1`, { headers: { Authorization: `Bearer ${STATIC_TOKEN}` } });
if (proof.length !== 1 || proof[0].slug !== 'pearl-component-workshop') throw new Error('Pearl reader could not resolve the canonical page');
if (denied.status !== 403) throw new Error(`Pearl reader unexpectedly accessed the Jeffrey page collection (${denied.status})`);

console.log(JSON.stringify({ ok: true, target: BASE, role: roleName, canonicalPages: proof.length, jeffreyPagesDenied: true }, null, 2));
