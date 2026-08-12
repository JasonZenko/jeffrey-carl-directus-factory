import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(
  resolve(process.cwd(), '../template-adapters/pearl/v0.1.0/manifest.json'),
  'utf8',
));

const EXPECTED_BLOCKS = [
  'areas_served_links',
  'content_image',
  'flex_content_image',
  'highlight_quote',
  'icon_circles',
  'inner_hero_cta',
  'main_hero',
  'patient_reviews',
  'split_image_content',
];

describe('Pearl template adapter contract', () => {
  it('is versioned, isolated and inactive until implementation gates pass', () => {
    expect(manifest.adapter_id).toBe('pearl');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.activation.active).toBe(false);
    expect(manifest.based_on.source_freeze).toBeTruthy();
  });

  it('defines the complete first Pearl block palette', () => {
    const keys = manifest.blocks.map((block: any) => block.key).sort();
    expect(keys).toEqual(EXPECTED_BLOCKS);
  });

  it('binds every block to a unique Directus carrier and Astro renderer', () => {
    const collections = new Set<string>();
    const carriers = new Set<string>();
    const renderers = new Set<string>();
    for (const block of manifest.blocks) {
      expect(block.directus.collection).toMatch(/^weo_pearl_[a-z_]+$/);
      expect(block.directus.carrier_field).toMatch(/^pearl_[a-z_]+$/);
      expect(block.renderer).toMatch(/^[A-Z][A-Za-z]+\.astro$/);
      collections.add(block.directus.collection);
      carriers.add(block.directus.carrier_field);
      renderers.add(block.renderer);
    }
    expect(collections.size).toBe(manifest.blocks.length);
    expect(carriers.size).toBe(manifest.blocks.length);
    expect(renderers.size).toBe(manifest.blocks.length);
  });

  it('makes every rendered field authoritative in Directus', () => {
    for (const block of manifest.blocks) {
      const fields = [...block.fields, ...(block.child_fields ?? [])];
      expect(fields.length, block.key).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field.authority, `${block.key}.${field.name}`).toBe('directus');
        expect(typeof field.required, `${block.key}.${field.name}`).toBe('boolean');
      }
    }
  });

  it('keeps images out of opaque Rich Text fields', () => {
    for (const key of ['flex_content_image', 'split_image_content', 'content_image']) {
      const block = manifest.blocks.find((item: any) => item.key === key);
      const image = block.fields.find((field: any) => field.name === 'image');
      const alt = block.fields.find((field: any) => field.name === 'image_alt');
      expect(image?.type, key).toBe('file');
      expect(image?.required, key).toBe(true);
      expect(alt?.required, key).toBe(true);
    }
  });

  it('fails closed when mapping evidence is unknown or ambiguous', () => {
    expect(manifest.mapping_policy.unknown).toBe('manual_review');
    expect(manifest.mapping_policy.ambiguous).toBe('manual_review');
    expect(manifest.mapping_policy.rich_text_fallback_allowed).toBe(false);
    for (const block of manifest.blocks) {
      expect(block.mapping.confidence, block.key)
        .toBeGreaterThanOrEqual(manifest.mapping_policy.minimum_auto_map_confidence);
      expect(block.mapping.required_all.length, block.key).toBeGreaterThan(0);
      expect(block.mapping.required_any.length, block.key).toBeGreaterThan(0);
      expect(block.mapping.reject_if.length, block.key).toBeGreaterThan(0);
    }
  });

  it('keeps mapping priority deterministic', () => {
    const priorities = manifest.blocks.map((block: any) => block.mapping.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it('allows only defined blocks in each page blueprint', () => {
    const blockKeys = new Set(manifest.blocks.map((block: any) => block.key));
    for (const blueprint of manifest.page_blueprints) {
      expect(blueprint.families.length, blueprint.key).toBeGreaterThan(0);
      for (const key of [...blueprint.allowed_blocks, ...blueprint.required_blocks]) {
        expect(blockKeys.has(key), `${blueprint.key}.${key}`).toBe(true);
      }
      for (const key of blueprint.required_blocks) {
        expect(blueprint.allowed_blocks, `${blueprint.key}.${key}`).toContain(key);
      }
    }
  });

  it('requires all four independent release gates', () => {
    expect(manifest.release_gates.sort()).toEqual([
      'authoring_fidelity',
      'field_authority',
      'frontend_fidelity',
      'source_fidelity',
    ]);
  });
});
