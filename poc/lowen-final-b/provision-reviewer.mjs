#!/usr/bin/env node
/** Create or reset one explicitly named isolated-CMS reviewer, then prove identity. */

import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.DIRECTUS_URL || 'https://pearl-lowen-poc-cms.foundryworks.ai').replace(/\/$/, '');
const REVIEWER_EMAIL = process.env.DOM_ADMIN_EMAIL?.trim().toLowerCase();
const REVIEWER_PASSWORD = process.env.DOM_ADMIN_PASSWORD;
if (!REVIEWER_EMAIL || !REVIEWER_PASSWORD) throw new Error('DOM_ADMIN_EMAIL and DOM_ADMIN_PASSWORD are required');

async function raw(path, {method = 'GET', body, token} = {}) {
  const response = await fetch(`${BASE}${path}`, {method, headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body === undefined ? {} : {'Content-Type': 'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);
  return payload.data;
}

async function login(email, password) {
  return (await raw('/auth/login', {method: 'POST', body: {email, password}})).access_token;
}

const adminToken = process.env.DIRECTUS_ADMIN_TOKEN || await login(process.env.DIRECTUS_ADMIN_EMAIL, process.env.DIRECTUS_ADMIN_PASSWORD);
const api = (path, options = {}) => raw(path, {...options, token: adminToken});
const roles = await api('/roles?filter[admin_access][_eq]=true&limit=1&fields=id,name,admin_access');
if (!roles[0]) throw new Error('Administrator role not found');
const users = await api(`/users?filter[email][_eq]=${encodeURIComponent(REVIEWER_EMAIL)}&limit=1&fields=id,email,status,role`);
const payload = {email: REVIEWER_EMAIL, password: REVIEWER_PASSWORD, status: 'active', role: roles[0].id, first_name: 'Dominique', last_name: 'Farrar'};
const mode = users[0] ? 'reset' : 'create';
if (users[0]) await api(`/users/${users[0].id}`, {method: 'PATCH', body: payload});
else await api('/users', {method: 'POST', body: payload});

const reviewerToken = await login(REVIEWER_EMAIL, REVIEWER_PASSWORD);
const identity = await raw('/users/me?fields=id,email,status,role.id,role.name,role.admin_access', {token: reviewerToken});
const ok = identity?.email?.toLowerCase() === REVIEWER_EMAIL && identity?.status === 'active' && identity?.role?.admin_access === true;
const receipt = {ok, mode, target: BASE, reviewer_email: REVIEWER_EMAIL, status: identity?.status, role: identity?.role?.name, administrator: identity?.role?.admin_access === true, password_disclosed: false};
await mkdir(resolve(HERE, 'receipts'), {recursive: true});
await writeFile(resolve(HERE, 'receipts/reviewer-access.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (!ok) process.exit(1);
