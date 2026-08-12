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
    expect(plan.collections).toHaveLength(12);
    expect(plan.fields).toHaveLength(104);
    expect(plan.relations).toHaveLength(18);
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
    expect(output).toContain('Dry run: 12 collections, 104 fields, 18 relations');
    expect(() => execFileSync('node', [script, '--apply'], {
      encoding: 'utf8', env: { PATH: process.env.PATH ?? '' }, stdio: 'pipe',
    })).toThrow();
  });
});
