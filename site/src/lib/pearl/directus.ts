import type { PearlRecordByBlock } from '../../components/pearl/types';

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
