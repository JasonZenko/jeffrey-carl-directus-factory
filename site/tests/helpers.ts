import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PageRecord, SiteRecord, TemplateRecord } from '../src/lib/contracts';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const SITE_ROOT = join(REPO_ROOT, 'site');

export const site = JSON.parse(
  readFileSync(join(SITE_ROOT, 'src/content/frozen/site.json'), 'utf8')) as SiteRecord;
export const templates = JSON.parse(
  readFileSync(join(SITE_ROOT, 'src/content/frozen/templates.json'), 'utf8')) as TemplateRecord[];
export const pages = JSON.parse(
  readFileSync(join(SITE_ROOT, 'src/content/frozen/pages.json'), 'utf8')) as PageRecord[];
export const contract = JSON.parse(
  readFileSync(join(REPO_ROOT, 'auditor/source-contract.json'), 'utf8'));

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** Mirror of the auditor's text normalization (auditor/build_source_contract.py). */
export function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

/** Strip tags and collapse whitespace (approximation of BeautifulSoup get_text). */
export function htmlToText(html: string): string {
  return normalizeText(
    html
      .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, ' '));
}
