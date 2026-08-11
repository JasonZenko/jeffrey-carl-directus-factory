/**
 * Typed content contracts shared by the Directus build adapter and the
 * frozen-data fallback. Both sources must return identical shapes so the
 * review build is byte-identical whether connected or disconnected.
 */

export type BlockType =
  | 'hero'
  | 'text_media'
  | 'feature_grid'
  | 'process'
  | 'faq'
  | 'cta'
  | 'testimonials'
  | 'stats'
  | 'gallery'
  | 'team_grid'
  | 'form'
  | 'embed';

export type PageFamily =
  | 'home'
  | 'service-detail'
  | 'about-team'
  | 'patient-resource'
  | 'conversion'
  | 'location';

export interface BlockProvenance {
  source_url: string;
  source_html_sha256: string;
  article_id: string;
  band_index: number;
  block_index: number;
  fragment_sha256: string;
  extractor: string;
}

export interface Block {
  id: string;
  sort: number;
  type: BlockType;
  article_id: string;
  /** Governed, source-derived HTML fragment (assets rewritten to managed paths). */
  html: string;
  /** Structured component fields mirroring the native Directus component record. */
  component: Record<string, unknown>;
  provenance: BlockProvenance;
}

export interface PageRecord {
  source_id: string;
  legacy_path: string;
  source_url: string;
  family: PageFamily;
  page_type: string;
  template: string;
  status: string;
  title: string;
  meta_description: string;
  canonical: string;
  source_h1: string[];
  schema_json: string[];
  robots_index: boolean;
  robots_follow: boolean;
  source_html_sha256: string;
  blocks: Block[];
}

export interface NavLink {
  label: string;
  href: string;
  target: string;
}

export interface SiteRecord {
  name: string;
  slug: string;
  source_url: string;
  status: string;
  indexing_enabled: boolean;
  phone: string;
  phone_href: string;
  address: string;
  appointment_path: string;
  logo: string;
  home_hero_image: string;
  home_hero_video_id: string;
  inner_hero_image: string;
  navigation: NavLink[];
  footer: { text: string; copyright: string; links: NavLink[] };
  homepage: { legacy_path: string };
}

export interface TemplateBlockBlueprint {
  sort: number;
  component_type: string;
  required: boolean;
}

export interface TemplateRecord {
  slug: string;
  name: string;
  family: PageFamily;
  page_type: string;
  blocks: TemplateBlockBlueprint[];
}

export interface ContentBundle {
  site: SiteRecord;
  templates: TemplateRecord[];
  pages: PageRecord[];
  source: 'directus' | 'frozen';
}
