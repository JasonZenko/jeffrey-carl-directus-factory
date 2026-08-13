#!/usr/bin/env node
const BASE = (process.env.DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? 'jason@foundryworks.ai';
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD;
const policyName = 'Pearl Public Assets';

async function raw(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
  return payload.data;
}

if (!APPLY) {
  console.log(JSON.stringify({ mode: 'dry-run', policy: policyName, fileTitlePrefix: 'Pearl canonical ·', target: BASE }, null, 2));
  process.exit(0);
}
if (!PASSWORD) throw new Error('DIRECTUS_ADMIN_PASSWORD is required with --apply');

const admin = (await raw('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).access_token;
const api = (path, options = {}) => raw(path, { ...options, token: admin });
const policies = await api(`/policies?filter[name][_eq]=${encodeURIComponent(policyName)}&limit=1`);
const policyPayload = {
  name: policyName,
  icon: 'image',
  description: 'Anonymous read access to Pearl-owned render assets only.',
  app_access: false,
  admin_access: false,
};
const policy = policies[0]
  ? await api(`/policies/${policies[0].id}`, { method: 'PATCH', body: policyPayload })
  : await api('/policies', { method: 'POST', body: policyPayload });

const access = await api('/access?limit=-1');
if (!access.some((entry) => entry.role === null && entry.policy === policy.id)) {
  await api('/access', { method: 'POST', body: { role: null, policy: policy.id, sort: 1 } });
}

const permissions = await api('/permissions?limit=-1');
const payload = {
  policy: policy.id,
  collection: 'directus_files',
  action: 'read',
  permissions: { title: { _starts_with: 'Pearl canonical ·' } },
  validation: null,
  presets: null,
  fields: ['id', 'storage', 'filename_download', 'title', 'type', 'width', 'height', 'filesize'],
};
const current = permissions.find((entry) => entry.policy === policy.id && entry.collection === 'directus_files' && entry.action === 'read');
if (current) await api(`/permissions/${current.id}`, { method: 'PATCH', body: payload });
else await api('/permissions', { method: 'POST', body: payload });

const pearlFiles = await api(`/files?filter[title][_starts_with]=${encodeURIComponent('Pearl canonical ·')}&limit=1&fields=id`);
if (pearlFiles.length === 0) throw new Error('No Pearl-owned file exists for public asset proof');
const proof = await fetch(`${BASE}/assets/${pearlFiles[0].id}`, { redirect: 'manual' });
if (!proof.ok) throw new Error(`Pearl public asset proof failed (${proof.status})`);

console.log(JSON.stringify({ ok: true, target: BASE, policy: policyName, assetRead: true }, null, 2));
