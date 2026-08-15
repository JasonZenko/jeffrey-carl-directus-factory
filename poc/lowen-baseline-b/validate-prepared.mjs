#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BASELINE_A = resolve(ROOT, '../lowen-baseline-a');
const readJson = path => readFile(path, 'utf8').then(JSON.parse);
const sha256 = value => createHash('sha256').update(value).digest('hex');

const [pagesRaw, assetsRaw, contractRaw, pages, site, mapping] = await Promise.all([
  readFile(resolve(BASELINE_A, 'source-freeze/manifests/pages.json')),
  readFile(resolve(BASELINE_A, 'source-freeze/manifests/assets.json')),
  readFile(resolve(BASELINE_A, 'contract/pearl-block-library.v1.json')),
  readJson(resolve(BASELINE_A, 'migration/pages.json')),
  readJson(resolve(BASELINE_A, 'migration/site.json')),
  readJson(resolve(BASELINE_A, 'migration/mapping-receipt.json')),
]);

const errors = [];
const expectedHashes = {
  pages: '575a5f3592f897acd764ff38edee8257e4ca5de86ab8d8395298e97dd95d8d0e',
  assets: '2cb1431ca318ae3990e76643cf6cc7c24670756b5f1eee8557338a6db29b37a1',
};
const hashes = {pages: sha256(pagesRaw), assets: sha256(assetsRaw), contract: sha256(contractRaw)};
for (const key of ['pages', 'assets']) if (hashes[key] !== expectedHashes[key]) errors.push(`${key} frozen-input hash drift`);

const contract = JSON.parse(contractRaw);
if (contract.version !== '1.1.0') errors.push(`contract version ${contract.version} is not 1.1.0`);
if (pages.length !== 39) errors.push(`expected 39 pages, received ${pages.length}`);
if (mapping.blocks !== pages.reduce((sum, page) => sum + page.blocks.length, 0)) errors.push('mapping block count drift');

const slugs = new Set(pages.map(page => page.slug));
if (site.navigation.length !== 6) errors.push(`expected six navigation items, received ${site.navigation.length}`);
for (const [index, item] of site.navigation.entries()) {
  if (item.sort !== index + 1) errors.push(`navigation sort drift at ${item.label}`);
  if (!item.label || !item.url || item.url.includes('#')) errors.push(`invalid navigation item ${item.label || index + 1}`);
  const match = item.url.match(/^\/template-preview\/pearl\/([^/]+)\/$/);
  if (item.url !== '/' && (!match || !slugs.has(match[1]))) errors.push(`navigation target is not a frozen route: ${item.url}`);
}

let flexBlocks = 0;
let explicitHandoffs = 0;
for (const page of pages) {
  for (const [index, block] of page.blocks.entries()) {
    if (block.type !== 'flex_content_section') continue;
    flexBlocks += 1;
    const location = `${page.slug}.blocks[${index}]`;
    if ('cta_label' in block.item || 'cta_url' in block.item) errors.push(`${location}: inline Flex CTA field survived`);
    if (!block.item.body_content) errors.push(`${location}: missing body content`);
    const features = block.mapping?.content_features;
    if (!features) errors.push(`${location}: missing source feature inventory`);
    if (features?.headings > 0 && !block.item.section_header) errors.push(`${location}: source heading was not handed off`);
    if (features?.images > 0 && !block.item.image) errors.push(`${location}: source image was not handed off`);
    const renderedLinks = (block.item.body_content.match(/\bhref=["']/gi) || []).length;
    const expectedLinks = Math.max(0, Number(features?.links || 0) - (block.mapping?.cta_handoff ? 1 : 0));
    if (renderedLinks < expectedLinks) errors.push(`${location}: ${expectedLinks - renderedLinks} source link(s) lost`);
    if (block.mapping?.cta_handoff) {
      explicitHandoffs += 1;
      const next = page.blocks[index + 1];
      if (next?.type !== 'cta_section_standard' || !next.mapping?.signals?.includes('source:adjacent_flex_handoff')) {
        errors.push(`${location}: explicit CTA was not emitted as the adjacent ordered CTA block`);
      }
    }
  }
}
if (flexBlocks === 0) errors.push('no Flex blocks were tested');

const receipt = {
  ok: errors.length === 0,
  baseline: 'B',
  frozen_pages: pages.length,
  mapped_blocks: mapping.blocks,
  flex_blocks: flexBlocks,
  explicit_flex_cta_handoffs: explicitHandoffs,
  navigation_items: site.navigation.length,
  contract_version: contract.version,
  hashes,
  errors,
};
await writeFile(resolve(ROOT, 'prepared-validation.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
if (errors.length) process.exitCode = 1;
