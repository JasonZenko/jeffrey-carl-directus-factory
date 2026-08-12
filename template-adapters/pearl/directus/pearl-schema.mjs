import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(HERE, '../v0.1.0/manifest.json');

const scalarType = (type) => {
  if (type === 'integer') return 'integer';
  if (type === 'text' || type === 'rich_text') return 'text';
  if (type === 'file' || type === 'file_or_svg') return 'uuid';
  return 'string';
};

const fieldMeta = (field) => {
  const meta = {
    interface: field.type === 'rich_text' ? 'input-rich-text-html' : 'input',
    note: 'Pearl adapter field. Directus is the rendering authority.',
    required: field.required,
  };
  if (field.type === 'text') meta.interface = 'input-multiline';
  if (field.type === 'integer') meta.interface = 'input';
  if (field.type === 'file' || field.type === 'file_or_svg') {
    meta.interface = 'file-image';
    meta.special = ['file'];
  }
  if (field.type.startsWith('enum:')) {
    meta.interface = 'select-dropdown';
    meta.options = { choices: field.type.slice(5).split('|').map((value) => ({ text: value, value })) };
  }
  return meta;
};

const baseCollection = (collection, label) => ({
  collection,
  meta: {
    icon: 'view_quilt',
    note: `Pearl template component: ${label}`,
    singleton: false,
    hidden: false,
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'draft',
  },
  schema: {},
});

const baseFields = (collection) => [
  { collection, field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input' }, schema: { is_primary_key: true, has_auto_increment: false } },
  { collection, field: 'status', type: 'string', meta: { interface: 'select-dropdown', options: { choices: [
    { text: 'Published', value: 'published' }, { text: 'Draft', value: 'draft' }, { text: 'Archived', value: 'archived' },
  ] }, width: 'half' }, schema: { default_value: 'draft', is_nullable: false } },
  { collection, field: 'internal_name', type: 'string', meta: { interface: 'input', required: true, width: 'half' }, schema: { is_nullable: false } },
];

const normalField = (collection, field) => ({
  collection,
  field: field.name,
  type: scalarType(field.type),
  meta: fieldMeta(field),
  schema: {
    is_nullable: !field.required,
    default_value: field.type.startsWith('enum:') ? field.type.slice(5).split('|')[0] : null,
  },
});

const fileRelation = (collection, field) => ({
  collection,
  field: field.name,
  related_collection: 'directus_files',
  meta: { one_field: null, sort_field: null },
  schema: { on_delete: 'SET NULL' },
});

export function buildPearlSchemaPlan(manifestPath = MANIFEST) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const plan = {
    adapter: `${manifest.adapter_id}@${manifest.version}`,
    requires: ['weo_page_blocks', 'directus_files'],
    collections: [],
    fields: [],
    relations: [],
  };

  for (const block of manifest.blocks) {
    const parent = block.directus.collection;
    plan.collections.push(baseCollection(parent, block.label));
    plan.fields.push(...baseFields(parent));

    for (const field of block.fields.filter((item) => item.type !== 'o2m')) {
      plan.fields.push(normalField(parent, field));
      if (field.type === 'file' || field.type === 'file_or_svg') plan.relations.push(fileRelation(parent, field));
    }

    if (block.directus.children) {
      const child = block.directus.children;
      const childAlias = block.fields.find((field) => field.type === 'o2m')?.name ?? 'items';
      plan.collections.push(baseCollection(child, `${block.label} item`));
      plan.fields.push(...baseFields(child));
      plan.fields.push({
        collection: parent, field: childAlias, type: 'alias',
        meta: { interface: 'list-o2m', special: ['o2m'], note: `Ordered ${block.label} items.` },
        schema: null,
      });
      plan.fields.push({
        collection: child, field: 'parent', type: 'uuid',
        meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: true },
        schema: { is_nullable: false },
      });
      for (const field of block.child_fields ?? []) {
        plan.fields.push(normalField(child, field));
        if (field.type === 'file' || field.type === 'file_or_svg') plan.relations.push(fileRelation(child, field));
      }
      plan.relations.push({
        collection: child, field: 'parent', related_collection: parent,
        meta: { one_field: childAlias, sort_field: 'sort' },
        schema: { on_delete: 'CASCADE' },
      });
    }

    plan.fields.push({
      collection: 'weo_page_blocks', field: block.directus.carrier_field, type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: false, note: `${block.label} component` },
      schema: { is_nullable: true },
    });
    plan.relations.push({
      collection: 'weo_page_blocks', field: block.directus.carrier_field, related_collection: parent,
      meta: { one_field: null }, schema: { on_delete: 'SET NULL' },
    });
  }

  return plan;
}

export function validatePearlSchemaPlan(plan) {
  const errors = [];
  const collectionNames = new Set(plan.collections.map((item) => item.collection));
  const fieldKeys = new Set();
  for (const field of plan.fields) {
    const key = `${field.collection}.${field.field}`;
    if (fieldKeys.has(key)) errors.push(`duplicate field ${key}`);
    fieldKeys.add(key);
  }
  for (const relation of plan.relations) {
    if (!fieldKeys.has(`${relation.collection}.${relation.field}`)) {
      errors.push(`relation without field ${relation.collection}.${relation.field}`);
    }
    if (!collectionNames.has(relation.related_collection) && !plan.requires.includes(relation.related_collection)) {
      errors.push(`unknown related collection ${relation.related_collection}`);
    }
  }
  return errors;
}
