import { describe, expect, it } from 'vitest';
import { pages, sha256, site, templates } from './helpers';

const BLOCK_PALETTE = [
  'hero', 'text_media', 'feature_grid', 'process', 'faq', 'cta',
  'testimonials', 'stats', 'gallery', 'team_grid', 'form', 'embed',
];
const TEMPLATE_SLUGS = [
  'homepage', 'service-treatment', 'about-team',
  'resource-article', 'contact-conversion', 'location-practice',
];

describe('block contracts', () => {
  it('uses only palette block types with a component for every block', () => {
    for (const page of pages) {
      for (const block of page.blocks) {
        expect(BLOCK_PALETTE, `${block.id} type`).toContain(block.type);
        expect(block.component, `${block.id} component`).toBeTypeOf('object');
        expect(Object.keys(block.component).length, `${block.id} component fields`).toBeGreaterThan(0);
        expect(block.html.length, `${block.id} html`).toBeGreaterThan(0);
      }
    }
  });

  it('blocks are ordered with contiguous sort keys per page', () => {
    for (const page of pages) {
      const sorts = page.blocks.map((b) => b.sort);
      expect(sorts, page.legacy_path).toEqual([...Array(sorts.length).keys()].map((i) => i + 1));
      const ids = new Set(page.blocks.map((b) => b.id));
      expect(ids.size, page.legacy_path).toBe(page.blocks.length);
    }
  });

  it('no page is collapsed into a whole-page blob', () => {
    // Every block belongs to exactly one article band and pages decompose
    // into multiple ordered blocks rather than one opaque container.
    let totalBlocks = 0;
    for (const page of pages) {
      const bands = new Set(page.blocks.map((b) => b.article_id));
      if (bands.size > 1) {
        expect(page.blocks.length, page.legacy_path).toBeGreaterThanOrEqual(bands.size);
      }
      for (const block of page.blocks) {
        expect(block.html, `${block.id} must not embed band markers`).not.toMatch(/id="ArtID\d+"/);
        expect(block.html, `${block.id} must not nest a full page`).not.toMatch(/<html|<body/i);
      }
      totalBlocks += page.blocks.length;
    }
    expect(totalBlocks).toBeGreaterThanOrEqual(400);
  });

  it('fragment provenance hash matches the stored governed html', () => {
    for (const page of pages) {
      for (const block of page.blocks) {
        expect(sha256(block.html), block.id).toBe(block.provenance.fragment_sha256);
      }
    }
  });

  it('six family templates exist and every page references one', () => {
    expect(templates.map((t) => t.slug).sort()).toEqual([...TEMPLATE_SLUGS].sort());
    for (const page of pages) {
      expect(TEMPLATE_SLUGS, page.legacy_path).toContain(page.template);
      const template = templates.find((t) => t.slug === page.template);
      expect(template?.family, page.legacy_path).toBe(page.family);
    }
  });

  it('site record carries noindex review status', () => {
    expect(site.indexing_enabled).toBe(false);
    expect(site.status).toBe('noindex-review');
    for (const page of pages) {
      expect(page.robots_index).toBe(false);
      expect(page.robots_follow).toBe(false);
    }
  });

  it('preserves semantic components and their double-nested child records', () => {
    const counts: Record<string, number> = {};
    let featureItems = 0;
    let testimonialItems = 0;
    let teamMembers = 0;
    for (const page of pages) {
      for (const block of page.blocks) {
        counts[block.type] = (counts[block.type] ?? 0) + 1;
        if (block.type === 'feature_grid') featureItems += block.component.items?.length ?? 0;
        if (block.type === 'testimonials') testimonialItems += block.component.items?.length ?? 0;
        if (block.type === 'team_grid') teamMembers += block.component.members?.length ?? 0;
      }
    }
    expect(counts).toEqual({
      hero: 44,
      text_media: 360,
      cta: 9,
      embed: 10,
      feature_grid: 42,
      testimonials: 21,
      team_grid: 21,
      form: 1,
    });
    expect(featureItems).toBe(168);
    expect(testimonialItems).toBe(21);
    expect(teamMembers).toBe(42);
  });

  it('does not flatten known homepage composites into rich text', () => {
    const homepage = pages.find((page) => page.family === 'home');
    expect(homepage?.blocks.map((block) => block.type)).toEqual([
      'feature_grid', 'feature_grid', 'testimonials', 'team_grid',
    ]);
    for (const page of pages.filter((item) => item.family === 'location')) {
      const types = page.blocks.map((block) => block.type);
      expect(types.filter((type) => type === 'feature_grid'), page.legacy_path).toHaveLength(2);
      expect(types.filter((type) => type === 'testimonials'), page.legacy_path).toHaveLength(1);
      expect(types.filter((type) => type === 'team_grid'), page.legacy_path).toHaveLength(1);
    }
  });
});
