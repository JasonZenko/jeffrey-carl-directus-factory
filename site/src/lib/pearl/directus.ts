import type { PearlBlock, PearlRecordByBlock } from '../../components/pearl/types';

export const PEARL_COLLECTION_BY_BLOCK = {
  main_hero: 'weo_pearl_main_heroes',
  inner_hero_cta: 'weo_pearl_inner_hero_ctas',
  flex_content_image: 'weo_pearl_flex_content_images',
  split_image_content: 'weo_pearl_split_image_contents',
  patient_reviews: 'weo_pearl_patient_reviews',
  areas_served_links: 'weo_pearl_areas_served',
  icon_circles: 'weo_pearl_icon_circles',
  highlight_quote: 'weo_pearl_highlight_quotes',
  content_image: 'weo_pearl_content_images',
} as const satisfies Record<keyof PearlRecordByBlock, string>;

export function directusAssetUrl(directusUrl: string, fileId: string): string {
  return `${directusUrl.replace(/\/$/, '')}/assets/${encodeURIComponent(fileId)}`;
}

const BLOCK_BY_COLLECTION = Object.fromEntries(
  Object.entries(PEARL_COLLECTION_BY_BLOCK).map(([type, collection]) => [collection, type]),
) as Record<string, keyof PearlRecordByBlock>;

const FILE_FIELDS: Partial<Record<keyof PearlRecordByBlock, readonly string[]>> = {
  main_hero: ['background_image'],
  inner_hero_cta: ['image'],
  flex_content_image: ['image'],
  split_image_content: ['image'],
  content_image: ['image'],
};

const REQUIRED_FIELDS: Record<keyof PearlRecordByBlock, readonly string[]> = {
  main_hero: ['heading'],
  inner_hero_cta: ['heading'],
  flex_content_image: ['body', 'image', 'image_alt', 'image_position'],
  split_image_content: ['body', 'image', 'image_alt', 'image_position', 'image_width', 'background_tone'],
  patient_reviews: ['reviews'],
  areas_served_links: ['heading', 'areas'],
  icon_circles: ['items'],
  highlight_quote: ['quote', 'tone'],
  content_image: ['image', 'image_alt', 'width', 'alignment'],
};

interface DirectusList<T> { data: T[] }

export interface PearlPage {
  slug: string;
  title: string;
  description?: string;
  blocks: PearlBlock[];
}

async function pearlApi<T>(path: string, token: string, directusUrl: string): Promise<T> {
  const response = await fetch(`${directusUrl.replace(/\/$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Pearl Directus ${response.status} for ${path}`);
  return (await response.json()) as T;
}

function requireFields(type: keyof PearlRecordByBlock, item: Record<string, unknown>): void {
  for (const field of REQUIRED_FIELDS[type]) {
    const value = item[field];
    if (value === null || value === undefined || value === '') {
      throw new Error(`Pearl ${type} is missing required field ${field}`);
    }
    if (Array.isArray(value) && value.length === 0) {
      throw new Error(`Pearl ${type}.${field} must contain at least one item`);
    }
  }
}

function hydrateBlock(row: Record<string, any>, directusUrl: string): PearlBlock {
  const type = BLOCK_BY_COLLECTION[row.collection];
  if (!type) throw new Error(`Unknown Pearl Builder collection: ${row.collection}`);
  if (!row.item || row.item.status !== 'published') throw new Error(`Pearl ${type} Builder item is missing or unpublished`);
  const item = structuredClone(row.item);
  delete item.id;
  delete item.status;
  delete item.internal_name;
  for (const field of FILE_FIELDS[type] ?? []) {
    if (item[field]) item[field] = directusAssetUrl(directusUrl, item[field]);
  }
  for (const childField of ['reviews', 'areas', 'items']) {
    if (!Array.isArray(item[childField])) continue;
    item[childField] = item[childField]
      .map((child: Record<string, any>) => {
        const clean = { ...child };
        delete clean.id;
        delete clean.status;
        delete clean.internal_name;
        delete clean.parent;
        if (childField === 'items' && clean.icon) clean.icon = directusAssetUrl(directusUrl, clean.icon);
        return clean;
      })
      .sort((a: Record<string, any>, b: Record<string, any>) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  }
  requireFields(type, item);
  return { type, item } as PearlBlock;
}

export async function getPearlPage(slug = 'pearl-component-workshop'): Promise<PearlPage> {
  const token = process.env.PEARL_DIRECTUS_TOKEN;
  if (!token) throw new Error('PEARL_DIRECTUS_TOKEN is required for connected Pearl builds');
  const directusUrl = process.env.PEARL_DIRECTUS_URL ?? process.env.DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai';
  const pages = await pearlApi<DirectusList<any>>(
    `/items/weo_pearl_pages?filter[slug][_eq]=${encodeURIComponent(slug)}&limit=1&fields=slug,title,description,status,robots_index,robots_follow`,
    token,
    directusUrl,
  );
  const page = pages.data[0];
  if (!page || page.status !== 'published') throw new Error(`Published Pearl page not found: ${slug}`);
  if (page.robots_index !== false || page.robots_follow !== false) throw new Error(`Pearl review page must remain noindex/nofollow: ${slug}`);

  const fields = [
    'id', 'sort', 'collection',
    'item:weo_pearl_main_heroes.*',
    'item:weo_pearl_inner_hero_ctas.*',
    'item:weo_pearl_flex_content_images.*',
    'item:weo_pearl_split_image_contents.*',
    'item:weo_pearl_patient_reviews.*', 'item:weo_pearl_patient_reviews.reviews.*',
    'item:weo_pearl_areas_served.*', 'item:weo_pearl_areas_served.areas.*',
    'item:weo_pearl_icon_circles.*', 'item:weo_pearl_icon_circles.items.*',
    'item:weo_pearl_highlight_quotes.*',
    'item:weo_pearl_content_images.*',
  ].join(',');
  const rows = await pearlApi<DirectusList<any>>(
    `/items/weo_pearl_page_builder?filter[page][slug][_eq]=${encodeURIComponent(slug)}&limit=-1&sort=sort&fields=${fields}`,
    token,
    directusUrl,
  );
  if (rows.data.length === 0) throw new Error(`Pearl page has no Builder blocks: ${slug}`);
  const blocks = rows.data.map((row) => hydrateBlock(row, directusUrl));
  if (new Set(blocks.map((block) => block.type)).size !== blocks.length) {
    throw new Error(`Pearl page contains duplicate block types: ${slug}`);
  }
  return { slug: page.slug, title: page.title, description: page.description, blocks };
}
