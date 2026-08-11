import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pages, sha256, SITE_ROOT } from './helpers';

const SHA256_RE = /^[0-9a-f]{64}$/;

describe('provenance', () => {
  it('every block carries complete source provenance', () => {
    for (const page of pages) {
      for (const block of page.blocks) {
        const p = block.provenance;
        expect(p.source_url, block.id).toBe(page.source_url);
        expect(p.source_html_sha256, block.id).toBe(page.source_html_sha256);
        expect(p.source_html_sha256, block.id).toMatch(SHA256_RE);
        expect(p.article_id, block.id).toMatch(/^ArtID\d+$/);
        expect(p.article_id, block.id).toBe(block.article_id);
        expect(p.fragment_sha256, block.id).toMatch(SHA256_RE);
        expect(p.extractor, block.id).toBe('foundry-semantic-extract-2.0.0');
        expect(p.band_index, block.id).toBeGreaterThanOrEqual(0);
        expect(p.block_index, block.id).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every managed image resolves to a frozen asset with byte-identical hash', () => {
    const imgRe = /<img\b[^>]*>/g;
    const srcRe = /\bsrc="(\/assets\/[^"]+)"/;
    const sourceRe = /\bdata-source-url="([^"]+)"/;
    let count = 0;
    for (const page of pages) {
      for (const block of page.blocks) {
        for (const match of block.html.matchAll(imgRe)) {
          const tag = match[0];
          const src = srcRe.exec(tag);
          const source = sourceRe.exec(tag);
          expect(src, `${block.id} managed img src: ${tag}`).not.toBeNull();
          expect(source, `${block.id} provenance url: ${tag}`).not.toBeNull();
          count += 1;
          const managed = join(SITE_ROOT, 'public', src![1]);
          expect(existsSync(managed), `${block.id} missing asset ${src![1]}`).toBe(true);
          expect(source![1], `${block.id} source url`).toMatch(/^https:\/\/(www\.)?jeffreycarldmd\.com\//);
        }
      }
    }
    expect(count).toBeGreaterThanOrEqual(130);
  });

  it('no rendered content references the live source host', () => {
    for (const page of pages) {
      for (const block of page.blocks) {
        // Links to the legacy host are rewritten to path-only; images are managed.
        const srcRefs = block.html.match(/(?:src|href)="https?:\/\/(?:www\.)?jeffreycarldmd\.com[^"]*"/g) ?? [];
        expect(srcRefs, `${block.id} live-source reference`).toEqual([]);
      }
    }
  });

  it('forms are neutered: no live action, no-send guard present', () => {
    for (const page of pages) {
      for (const block of page.blocks.filter((b) => b.type === 'form')) {
        expect(block.html).toContain('action=""');
        expect(block.html).toContain('data-review-noop="true"');
        expect(block.html).toContain('onsubmit="return false"');
        expect(block.html).not.toMatch(/action="https?:/);
      }
    }
  });
});
