import { PEARL_FIELD_KEYS, type PearlBlock, type PearlRecordByBlock, type PearlVisualRef } from '../../components/pearl/types';
import type { PearlTheme } from './theme';

export const PEARL_COLLECTION_BY_BLOCK = {
  inner_hero_standard: 'pearl_inner_hero_standard',
  flex_content_section: 'pearl_flex_content_section',
  highlight_links: 'pearl_highlight_links',
  image_gallery_grid: 'pearl_image_gallery_grid',
  testimonial_list_standard: 'pearl_testimonial_list_standard',
  main_hero_standard: 'pearl_main_hero_standard',
  icon_feature_cards: 'pearl_icon_feature_cards',
  feature_image_content: 'pearl_feature_image_content',
  highlight_snippet_quote: 'pearl_highlight_snippet_quote',
  cta_section_standard: 'pearl_cta_section_standard',
  contact_info_standard: 'pearl_contact_info_standard',
  areas_served_links: 'pearl_areas_served_links',
  faq_dropdown: 'pearl_faq_dropdown',
  cherry_financing: 'pearl_cherry_financing',
} as const satisfies Record<keyof PearlRecordByBlock, string>;

export function directusAssetUrl(directusUrl: string, fileId: string): string {
  return `${directusUrl.replace(/\/$/, '')}/assets/${encodeURIComponent(fileId)}`;
}

const BLOCK_BY_COLLECTION = Object.fromEntries(
  Object.entries(PEARL_COLLECTION_BY_BLOCK).map(([type, collection]) => [collection, type]),
) as Record<string, keyof PearlRecordByBlock>;

const FILE_FIELDS: Partial<Record<keyof PearlRecordByBlock, readonly string[]>> = {
  inner_hero_standard: ['featured_image'],
  flex_content_section: ['image'],
  image_gallery_grid: [],
  main_hero_standard: ['background_image'],
  icon_feature_cards: ['background_image'],
  feature_image_content: ['image'],
  cta_section_standard: ['background_image'],
};

const REQUIRED_FIELDS: Record<keyof PearlRecordByBlock, readonly string[]> = {
  inner_hero_standard: ['page_title'],
  flex_content_section: ['body_content'],
  highlight_links: ['links'],
  image_gallery_grid: ['images', 'grid_columns'],
  testimonial_list_standard: ['reviews'],
  main_hero_standard: ['heading'],
  icon_feature_cards: ['items'],
  feature_image_content: ['heading', 'body', 'image', 'image_alt', 'image_position'],
  highlight_snippet_quote: ['quote', 'tone'],
  cta_section_standard: ['heading', 'cta_label', 'cta_url'],
  contact_info_standard: ['address'],
  areas_served_links: ['areas'],
  faq_dropdown: ['items'],
  cherry_financing: ['heading'],
};

const CHILD_ALIASES = ['links', 'images', 'reviews', 'items', 'areas'] as const;
const CHILD_FILE_FIELDS = new Set(['icon', 'image']);

interface DirectusList<T> { data: T[] }
interface DirectusItem<T> { data: T }

export interface PearlPage {
  slug: string;
  title: string;
  description?: string;
  blocks: PearlBlock[];
  theme: PearlTheme;
  pageVisual?: PearlVisualRef;
  themeVisual?: PearlVisualRef;
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
    if (value === null || value === undefined || value === '') throw new Error(`Pearl ${type} is missing required field ${field}`);
    if (Array.isArray(value) && value.length === 0) throw new Error(`Pearl ${type}.${field} must contain at least one item`);
  }
}

function hydrateBlock(row: Record<string, any>, directusUrl: string): PearlBlock {
  const type = BLOCK_BY_COLLECTION[row.collection];
  if (!type) throw new Error(`Unknown official Pearl Builder collection: ${row.collection}`);
  if (!row.item || row.item.status !== 'published') throw new Error(`Pearl ${type} Builder item is missing or unpublished`);
  const item = structuredClone(row.item);
  const itemId = item.id;
  delete item.id;
  delete item.status;
  delete item.internal_name;
  for (const field of FILE_FIELDS[type] ?? []) if (item[field]) item[field] = directusAssetUrl(directusUrl, item[field]);
  for (const childField of CHILD_ALIASES) {
    if (!Array.isArray(item[childField])) continue;
    item[childField] = item[childField]
      .map((child: Record<string, any>) => {
        const clean = {...child};
        delete clean.id;
        delete clean.status;
        delete clean.internal_name;
        delete clean.parent;
        for (const fileField of CHILD_FILE_FIELDS) if (clean[fileField]) clean[fileField] = directusAssetUrl(directusUrl, clean[fileField]);
        return clean;
      })
      .sort((a: Record<string, any>, b: Record<string, any>) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  }
  requireFields(type, item);
  return {
    type,
    item,
    visual: {collection: row.collection, item: itemId, fields: [...PEARL_FIELD_KEYS[type]], mode: 'drawer'},
  } as PearlBlock;
}

export async function getPearlPage(slug = 'home'): Promise<PearlPage> {
  const token = process.env.PEARL_DIRECTUS_TOKEN;
  if (!token) throw new Error('PEARL_DIRECTUS_TOKEN is required for connected Pearl builds');
  const directusUrl = process.env.PEARL_DIRECTUS_URL ?? 'https://pearlcms.foundryworks.ai';
  const [pages, themes] = await Promise.all([
    pearlApi<DirectusList<any>>(`/items/pearl_pages?filter[slug][_eq]=${encodeURIComponent(slug)}&limit=1&fields=id,slug,title,meta_description,status,robots_index,robots_follow`, token, directusUrl),
    pearlApi<DirectusItem<any>>('/items/pearl_theme_settings?fields=*', token, directusUrl),
  ]);
  const page = pages.data[0];
  if (!page || page.status !== 'published') throw new Error(`Published Pearl page not found: ${slug}`);
  if (page.robots_index !== false || page.robots_follow !== false) throw new Error(`Pearl review page must remain noindex/nofollow: ${slug}`);
  const theme = themes.data;
  if (!theme || theme.status !== 'published') throw new Error('Published Pearl theme settings not found');
  const themeId = theme.id;
  delete theme.id;
  delete theme.status;

  const fields = [
    'id', 'sort', 'collection',
    'item:pearl_inner_hero_standard.*',
    'item:pearl_flex_content_section.*',
    'item:pearl_highlight_links.*', 'item:pearl_highlight_links.links.*',
    'item:pearl_image_gallery_grid.*', 'item:pearl_image_gallery_grid.images.*',
    'item:pearl_testimonial_list_standard.*', 'item:pearl_testimonial_list_standard.reviews.*',
    'item:pearl_main_hero_standard.*',
    'item:pearl_icon_feature_cards.*', 'item:pearl_icon_feature_cards.items.*',
    'item:pearl_feature_image_content.*',
    'item:pearl_highlight_snippet_quote.*',
    'item:pearl_cta_section_standard.*',
    'item:pearl_contact_info_standard.*',
    'item:pearl_areas_served_links.*', 'item:pearl_areas_served_links.areas.*',
    'item:pearl_faq_dropdown.*', 'item:pearl_faq_dropdown.items.*',
    'item:pearl_cherry_financing.*',
  ].join(',');
  const rows = await pearlApi<DirectusList<any>>(`/items/pearl_page_builder?filter[page][slug][_eq]=${encodeURIComponent(slug)}&limit=-1&sort=sort&fields=${fields}`, token, directusUrl);
  if (rows.data.length === 0) throw new Error(`Pearl page has no Builder blocks: ${slug}`);
  const blocks = rows.data.map(row => hydrateBlock(row, directusUrl));
  return {
    slug: page.slug,
    title: page.title,
    description: page.meta_description,
    blocks,
    theme,
    pageVisual: {collection: 'pearl_pages', item: page.id, fields: ['title', 'meta_description'], mode: 'drawer'},
    themeVisual: {collection: 'pearl_theme_settings', item: themeId, mode: 'drawer'},
  };
}
