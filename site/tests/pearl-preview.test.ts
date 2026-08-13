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
const HOMEPAGE_SEQUENCE = [
  'main_hero', 'icon_circles', 'flex_content_image', 'icon_circles',
  'patient_reviews', 'flex_content_image', 'areas_served_links', 'inner_hero_cta',
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

  it('builds the approved noindex Pearl homepage while retaining all nine renderers in the library', () => {
    const output = join(SITE_ROOT, 'dist/template-preview/pearl/index.html');
    expect(existsSync(output), 'run npm run build before tests').toBe(true);
    const html = readFileSync(output, 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(html).toContain('data-template-adapter="pearl"');
    expect(html).toContain('data-template-version="0.1.0"');
    expect(html).toContain('class="pearl-site-header"');
    expect(html).toContain('class="pearl-site-footer"');
    expect(html).toContain('--pearl-weight-h2:400');
    expect([...html.matchAll(/data-pearl-block="([^"]+)"/g)].map((match) => match[1]))
      .toEqual(HOMEPAGE_SEQUENCE);
  });

  it('keeps image descriptions and navigation labels in the rendered fixture', () => {
    const html = readFileSync(join(SITE_ROOT, 'dist/template-preview/pearl/index.html'), 'utf8');
    expect(html).toContain('alt="Dentist welcoming a patient in a bright treatment room"');
    expect(html).toContain('alt="Dr. Amanda Pearl"');
    expect(html).toContain('aria-label="Visit Pearl Dentistry"');
    expect(html).toContain('aria-label="Social media"');
    expect(html).toMatch(/<a href="#top"[^>]*>home<\/a>/);
    expect(html).toMatch(/<a href="#services"[^>]*>services<\/a>/);
    expect(html).toMatch(/<a href="#about"[^>]*>about<\/a>/);
    expect(html).toMatch(/<a href="#contact"[^>]*>contact<\/a>/);
  });
});
