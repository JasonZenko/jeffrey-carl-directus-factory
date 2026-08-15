#!/usr/bin/env node
/** Fail-closed contract and content-hygiene checks for a Pearl migration release. */

import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = resolve(ROOT, 'contract/pearl-block-library.v1.json');
const HASH = /^[a-f0-9]{64}$/i;
const PLACEHOLDER = /\b(?:lorem ipsum|placeholder|todo|tbd|example\.com|pearl dentistry|amanda pearl)\b/i;
const LEGACY_MARKUP = /\b(?:class|id)=["'][^"']*\bTP[A-Za-z0-9_-]*/i;
const LEGACY_HOSTS = new Set(['lowenperio.com', 'www.lowenperio.com', 'jeffreycarldmd.com', 'www.jeffreycarldmd.com']);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
};

const same = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

export async function loadCanonicalContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, 'utf8'));
}

export function canonicalLibraryRows(contract) {
  return contract.blocks.map(block => ({
    key: block.key,
    collection_name: block.collection,
    field_contract: {
      fields: block.fields,
      ...(block.children ? {children: block.children} : {}),
    },
  }));
}

export function validateContractParity(libraryRows, contract) {
  const errors = [];
  const expected = canonicalLibraryRows(contract);
  const byKey = new Map(libraryRows.map(row => [row.key, row]));
  if (libraryRows.length !== expected.length) errors.push(`official block count ${libraryRows.length} != ${expected.length}`);
  for (const block of expected) {
    const actual = byKey.get(block.key);
    if (!actual) {
      errors.push(`missing official block ${block.key}`);
      continue;
    }
    if (actual.status !== undefined && actual.status !== 'published') errors.push(`${block.key} is not published`);
    if (actual.collection_name !== block.collection_name) errors.push(`${block.key} collection drift`);
    if (!same(actual.field_contract, block.field_contract)) errors.push(`${block.key} field contract drift`);
  }
  for (const row of libraryRows) if (!expected.some(block => block.key === row.key)) errors.push(`unknown official block ${row.key}`);
  return errors;
}

function requiredMissing(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function validateUrl(value, location, errors) {
  if (typeof value !== 'string' || value.trim() === '') return;
  const url = value.trim();
  if (/^\d+$/.test(url) || /^\/?\d+\/?$/.test(url)) errors.push(`${location}: numeric-only URL ${url}`);
  if (url === '#' || /^(?:javascript|vbscript|data):/i.test(url)) errors.push(`${location}: invalid URL ${url}`);
  if (!/^(?:https?:|mailto:|tel:|\/)/i.test(url)) errors.push(`${location}: unsupported URL ${url}`);
  if (/^https?:/i.test(url)) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (LEGACY_HOSTS.has(host)) errors.push(`${location}: legacy source host ${host}`);
    } catch {
      errors.push(`${location}: malformed URL ${url}`);
    }
  }
}

function validateRichText(value, location, errors) {
  if (typeof value !== 'string') return;
  if (LEGACY_MARKUP.test(value)) errors.push(`${location}: legacy TP wrapper leaked into rich text`);
  for (const match of value.matchAll(/\b(?:href|src)=["']([^"']*)["']/gi)) validateUrl(match[1], `${location} ${match[0].slice(0, 4)}`, errors);
}

function validateFields(item, fields, location, errors) {
  const allowed = new Set(fields.map(field => field.name));
  for (const key of Object.keys(item)) if (!allowed.has(key)) errors.push(`${location}: unknown field ${key}`);
  for (const field of fields) {
    const value = item[field.name];
    if (field.required && requiredMissing(value)) errors.push(`${location}: missing required field ${field.name}`);
    if (value === undefined || value === null) continue;
    if (field.type === 'integer' && !Number.isInteger(Number(value))) errors.push(`${location}.${field.name}: expected integer`);
    if (/url$/i.test(field.name)) validateUrl(value, `${location}.${field.name}`, errors);
    if (field.type === 'text') validateRichText(value, `${location}.${field.name}`, errors);
    if (typeof value === 'string' && PLACEHOLDER.test(value)) errors.push(`${location}.${field.name}: placeholder content`);
  }
}

export function validateRelease({pages, exceptions, contract}) {
  const errors = [];
  const byType = new Map(contract.blocks.map(block => [block.key, block]));
  const home = pages.find(page => page.slug === 'home');
  if (!home) errors.push('missing homepage');
  if (home?.blocks.some(block => block.type === 'contact_info_standard')) errors.push('homepage Contact Info block is no longer required; contact belongs in the footer');

  for (const page of pages) {
    if (!HASH.test(page.source_html_sha256 || '')) errors.push(`${page.slug}: missing page source hash`);
    for (const [index, block] of page.blocks.entries()) {
      const location = `${page.slug}.blocks[${index}]`;
      const spec = byType.get(block.type);
      if (!spec) {
        errors.push(`${location}: unknown block ${block.type}`);
        continue;
      }
      const parentFields = spec.children
        ? [...spec.fields, {name: spec.children.alias, type: 'o2m', required: true}]
        : spec.fields;
      validateFields(block.item || {}, parentFields, `${location}.${block.type}`, errors);
      if (spec.children) {
        const children = block.item?.[spec.children.alias];
        if (!Array.isArray(children) || children.length === 0) errors.push(`${location}: missing ${spec.children.alias}`);
        for (const [childIndex, child] of (children || []).entries()) {
          validateFields(child, spec.children.fields, `${location}.${spec.children.alias}[${childIndex}]`, errors);
          if (child.rating !== undefined) {
            if (!Number.isInteger(child.rating) || child.rating < 1 || child.rating > 5) errors.push(`${location}: rating must be an integer from 1 to 5`);
            if (!block.mapping?.signals?.includes('source:TPstars')) errors.push(`${location}: rating has no explicit source-star evidence`);
          }
        }
      }
      const mapping = block.mapping;
      if (!mapping) {
        errors.push(`${location}: missing mapping evidence`);
        continue;
      }
      if (mapping.decision !== 'auto_map') errors.push(`${location}: unresolved mapping decision ${mapping.decision}`);
      if (typeof mapping.confidence !== 'number' || mapping.confidence < 0.9) errors.push(`${location}: confidence below 0.90`);
      if (!Array.isArray(mapping.signals) || mapping.signals.length === 0) errors.push(`${location}: missing mapping signals`);
      if (!mapping.source_url || !HASH.test(mapping.source_html_sha256 || '') || !HASH.test(mapping.fragment_sha256 || '')) errors.push(`${location}: incomplete provenance`);
    }
  }

  for (const [index, exception] of exceptions.entries()) {
    if (exception.status !== 'manual_review') errors.push(`exceptions[${index}]: unresolved exception lacks manual_review status`);
    if (!exception.reason && !exception.provider) errors.push(`exceptions[${index}]: missing reason/provider`);
    if (!HASH.test(exception.source_html_sha256 || '') || !HASH.test(exception.fragment_sha256 || '')) errors.push(`exceptions[${index}]: incomplete provenance`);
  }
  return errors;
}

async function main() {
  const [contract, pages, exceptions] = await Promise.all([
    loadCanonicalContract(),
    readFile(resolve(ROOT, 'migration/pages.json'), 'utf8').then(JSON.parse),
    readFile(resolve(ROOT, 'migration/exceptions.json'), 'utf8').then(JSON.parse),
  ]);
  const errors = validateRelease({pages, exceptions, contract});
  console.log(JSON.stringify({ok: errors.length === 0, pages: pages.length, blocks: pages.reduce((sum, page) => sum + page.blocks.length, 0), exceptions: exceptions.length, errors}, null, 2));
  if (errors.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
