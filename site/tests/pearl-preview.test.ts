import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PEARL_CHILD_FIELD_KEYS, PEARL_FIELD_KEYS } from '../src/components/pearl/types';
import { REPO_ROOT, SITE_ROOT } from './helpers';

const COMPONENTS = [
  'MainHero', 'InnerHeroCta', 'FlexContentImage',
  'SplitImageContent', 'PatientReviews', 'AreasServedLinks',
  'IconCircles', 'HighlightQuote', 'ContentImage',
];
const BLOCKS = [
  'main_hero', 'inner_hero_cta', 'flex_content_image', 'split_image_content',
  'patient_reviews', 'areas_served_links', 'icon_circles', 'highlight_quote', 'content_image',
];

describe('Pearl Astro fixture surface', () => {
  it('implements every renderer named by the adapter manifest behind one block boundary', () => {
    const manifest = JSON.parse(readFileSync(
      join(REPO_ROOT, 'template-adapters/pearl/v0.1.0/manifest.json'), 'utf8'));
    expect(manifest.blocks.map((block: any) => block.renderer).sort())
      .toEqual(COMPONENTS.map((name) => `${name}.astro`).sort());
    for (const component of COMPONENTS) {
      expect(existsSync(join(SITE_ROOT, `src/components/pearl/blocks/${component}.astro`)), component).toBe(true);
    }
    expect(existsSync(join(SITE_ROOT, 'src/components/pearl/blocks/BlockRenderer.astro'))).toBe(true);
  });

  it('keeps component props identical to the Directus manifest fields', () => {
    const manifest = JSON.parse(readFileSync(
      join(REPO_ROOT, 'template-adapters/pearl/v0.1.0/manifest.json'), 'utf8'));
    for (const block of manifest.blocks) {
      expect([...PEARL_FIELD_KEYS[block.key as keyof typeof PEARL_FIELD_KEYS]], block.key)
        .toEqual(block.fields.map((field: any) => field.name));
      if (block.child_fields) {
        expect([...PEARL_CHILD_FIELD_KEYS[block.key as keyof typeof PEARL_CHILD_FIELD_KEYS]], `${block.key}.children`)
          .toEqual(block.child_fields.map((field: any) => field.name));
      }
    }
  });

  it('colocates each component visual treatment and keeps the shared stylesheet foundational', () => {
    for (const component of COMPONENTS) {
      const source = readFileSync(join(SITE_ROOT, `src/components/pearl/blocks/${component}.astro`), 'utf8');
      expect(source, component).toContain('<style>');
      expect(source, component).toContain(`PearlRecordByBlock[`);
    }
    const shared = readFileSync(join(SITE_ROOT, 'src/styles/pearl.css'), 'utf8');
    expect(shared).not.toContain('.pearl-main-hero');
    expect(shared).not.toContain('.pearl-split__copy');
    expect(shared).not.toContain('.pearl-reviews__list');
  });

  it('builds one noindex workshop containing all nine component fixtures', () => {
    const output = join(SITE_ROOT, 'dist/template-preview/pearl/index.html');
    expect(existsSync(output), 'run npm run build before tests').toBe(true);
    const html = readFileSync(output, 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(html).toContain('data-template-adapter="pearl"');
    expect(html).toContain('data-template-version="0.1.0"');
    expect(html).toContain('not client production');
    for (const block of BLOCKS) {
      expect(html, block).toContain(`data-pearl-block="${block}"`);
    }
  });

  it('keeps image descriptions and navigation labels in the rendered fixture', () => {
    const html = readFileSync(join(SITE_ROOT, 'dist/template-preview/pearl/index.html'), 'utf8');
    expect(html).toContain('alt="Dr. Jeffrey Carl reviewing a dental X-ray with a patient"');
    expect(html).toContain('alt="Waiting room inside the Albany dental practice"');
    expect(html).toContain('aria-label="Areas served"');
    expect(html).toContain('aria-label="5 out of 5 stars"');
  });
});
