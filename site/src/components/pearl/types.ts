export interface PearlMainHeroRecord {
  heading: string;
  supporting_text?: string;
  background_image?: string;
  background_video_url?: string;
  primary_cta_label?: string;
  primary_cta_url?: string;
}

export interface PearlInnerHeroCtaRecord {
  heading: string;
  secondary_heading?: string;
  body?: string;
  image?: string;
  image_alt?: string;
  cta_label?: string;
  cta_url?: string;
}

export interface PearlFlexContentImageRecord {
  heading?: string;
  body: string;
  image: string;
  image_alt: string;
  image_position: 'left' | 'right';
  cta_label?: string;
  cta_url?: string;
}

export interface PearlSplitImageContentRecord {
  heading?: string;
  body: string;
  image: string;
  image_alt: string;
  image_position: 'left' | 'right';
  image_width: 'half' | 'wide';
  background_tone: 'white' | 'light' | 'brand';
}

export interface PearlPatientReviewItem {
  quote: string;
  name?: string;
  rating?: number;
  sort: number;
}

export interface PearlPatientReviewsRecord {
  heading?: string;
  intro?: string;
  reviews: PearlPatientReviewItem[];
}

export interface PearlAreaLinkItem {
  label: string;
  url: string;
  sort: number;
}

export interface PearlAreasServedLinksRecord {
  heading: string;
  intro?: string;
  areas: PearlAreaLinkItem[];
}

export interface PearlIconCircleItem {
  icon: string;
  title: string;
  body?: string;
  url?: string;
  sort: number;
}

export interface PearlIconCirclesRecord {
  heading?: string;
  intro?: string;
  items: PearlIconCircleItem[];
}

export interface PearlHighlightQuoteRecord {
  quote: string;
  attribution?: string;
  tone: 'light' | 'brand' | 'dark';
}

export interface PearlContentImageRecord {
  image: string;
  image_alt: string;
  caption?: string;
  width: 'content' | 'wide' | 'full';
  alignment: 'left' | 'center' | 'right';
}

export type PearlRecordByBlock = {
  main_hero: PearlMainHeroRecord;
  inner_hero_cta: PearlInnerHeroCtaRecord;
  flex_content_image: PearlFlexContentImageRecord;
  split_image_content: PearlSplitImageContentRecord;
  patient_reviews: PearlPatientReviewsRecord;
  areas_served_links: PearlAreasServedLinksRecord;
  icon_circles: PearlIconCirclesRecord;
  highlight_quote: PearlHighlightQuoteRecord;
  content_image: PearlContentImageRecord;
};

export type PearlBlock = {
  [K in keyof PearlRecordByBlock]: { type: K; item: PearlRecordByBlock[K] }
}[keyof PearlRecordByBlock];

export const PEARL_FIELD_KEYS = {
  main_hero: ['heading', 'supporting_text', 'background_image', 'background_video_url', 'primary_cta_label', 'primary_cta_url'],
  inner_hero_cta: ['heading', 'secondary_heading', 'body', 'image', 'image_alt', 'cta_label', 'cta_url'],
  flex_content_image: ['heading', 'body', 'image', 'image_alt', 'image_position', 'cta_label', 'cta_url'],
  split_image_content: ['heading', 'body', 'image', 'image_alt', 'image_position', 'image_width', 'background_tone'],
  patient_reviews: ['heading', 'intro', 'reviews'],
  areas_served_links: ['heading', 'intro', 'areas'],
  icon_circles: ['heading', 'intro', 'items'],
  highlight_quote: ['quote', 'attribution', 'tone'],
  content_image: ['image', 'image_alt', 'caption', 'width', 'alignment'],
} as const satisfies Record<keyof PearlRecordByBlock, readonly string[]>;

export const PEARL_CHILD_FIELD_KEYS = {
  patient_reviews: ['quote', 'name', 'rating', 'sort'],
  areas_served_links: ['label', 'url', 'sort'],
  icon_circles: ['icon', 'title', 'body', 'url', 'sort'],
} as const;
