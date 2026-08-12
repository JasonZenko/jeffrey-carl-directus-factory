import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers';
import { buildPearlSchemaPlan, validatePearlSchemaPlan } from '../../template-adapters/pearl/directus/pearl-schema.mjs';

const plan = buildPearlSchemaPlan();

describe('Pearl Directus schema', () => {
  it('produces a valid, complete, non-destructive plan', () => {
    expect(validatePearlSchemaPlan(plan)).toEqual([]);
    expect(plan.adapter).toBe('pearl@0.1.0');
    expect(plan.requires).toEqual(['weo_page_blocks', 'directus_files']);
    expect(plan.collections).toHaveLength(14);
    expect(plan.fields).toHaveLength(118);
    expect(plan.relations).toHaveLength(20);
  });

  it('creates one component carrier per Pearl block on the existing page-block junction', () => {
    const carriers = plan.fields.filter((field: any) =>
      field.collection === 'weo_page_blocks' && field.field.startsWith('pearl_'));
    expect(carriers).toHaveLength(9);
    for (const carrier of carriers) {
      expect(carrier.type).toBe('uuid');
      expect(carrier.schema.is_nullable).toBe(true);
    }
  });

  it('declares UUID primary keys that match the existing page-block carriers', () => {
    for (const collection of plan.collections) {
      const primaryKey = plan.fields.find((field: any) =>
        field.collection === collection.collection && field.field === 'id');
      expect(primaryKey, collection.collection).toMatchObject({
        type: 'uuid',
        meta: { special: ['uuid'] },
        schema: { is_primary_key: true, is_nullable: false, has_auto_increment: false },
      });
    }

    const provisioner = `${REPO_ROOT}/template-adapters/pearl/directus/provision-pearl-schema.mjs`;
    const source = readFileSync(provisioner, 'utf8');
    expect(source).toContain("fields: [primaryKey]");
  });

  it('models repeated reviews, area links and icon circles as ordered child collections', () => {
    for (const parent of ['weo_pearl_patient_reviews', 'weo_pearl_areas_served', 'weo_pearl_icon_circles']) {
      const relation = plan.relations.find((item: any) => item.related_collection === parent && item.field === 'parent');
      expect(relation, parent).toBeTruthy();
      expect(relation.schema.on_delete).toBe('CASCADE');
      expect(relation.meta.sort_field).toBe('sort');
    }
  });

  it('keeps dry-run as the default and refuses apply without explicit credentials', () => {
    const script = `${REPO_ROOT}/template-adapters/pearl/directus/provision-pearl-schema.mjs`;
    const output = execFileSync('node', [script], { encoding: 'utf8' });
    expect(output).toContain('Dry run: 14 collections, 118 fields, 20 relations');
    expect(() => execFileSync('node', [script, '--apply'], {
      encoding: 'utf8', env: { PATH: process.env.PATH ?? '' }, stdio: 'pipe',
    })).toThrow();
  });

  it('keeps Pearl composition isolated in a native ordered M2A Builder', () => {
    const itemRelation = plan.relations.find((item: any) =>
      item.collection === 'weo_pearl_page_builder' && item.field === 'item');
    const pageRelation = plan.relations.find((item: any) =>
      item.collection === 'weo_pearl_page_builder' && item.field === 'page');
    expect(itemRelation.meta.one_allowed_collections).toHaveLength(9);
    expect(pageRelation).toMatchObject({
      related_collection: 'weo_pearl_pages',
      meta: { one_field: 'blocks', sort_field: 'sort', one_deselect_action: 'delete' },
      schema: { on_delete: 'CASCADE' },
    });
  });
});
