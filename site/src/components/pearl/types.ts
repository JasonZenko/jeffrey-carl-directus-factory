export interface PearlVisualRef {
  collection: string;
  item: string | number;
  fields?: string | string[];
  mode?: 'drawer' | 'modal' | 'popover';
}

export interface PearlInnerHeroStandardRecord { page_title: string; intro_paragraph?: string; featured_image?: string; image_alt?: string; cta_label?: string; cta_url?: string; }
export interface PearlFlexContentSectionRecord { section_header?: string; body_content: string; image?: string; image_alt?: string; header_tag?: 'h1'|'h2'|'h3'; image_position?: 'left'|'right'; }
export interface PearlHighlightLinkItem { link_label: string; link_url: string; sort: number; }
export interface PearlHighlightLinksRecord { section_heading?: string; links: PearlHighlightLinkItem[]; }
export interface PearlGalleryItem { image: string; image_alt: string; sort: number; }
export interface PearlImageGalleryGridRecord { section_heading?: string; grid_columns: 3|4; images: PearlGalleryItem[]; }
export interface PearlTestimonialItem { quote: string; patient_name?: string; sort: number; }
export interface PearlTestimonialListStandardRecord { section_heading?: string; intro_text?: string; reviews: PearlTestimonialItem[]; }
export interface PearlMainHeroStandardRecord { heading: string; supporting_text?: string; background_image?: string; background_video_url?: string; primary_cta_label?: string; primary_cta_url?: string; }
export interface PearlIconFeatureItem { icon: string; title: string; body?: string; url?: string; sort: number; }
export interface PearlIconFeatureCardsRecord { section_heading?: string; intro_text?: string; background_image?: string; display_variant?: 'overlay'|'services'; items: PearlIconFeatureItem[]; }
export interface PearlFeatureImageContentRecord { heading: string; subheading?: string; body: string; image: string; image_alt: string; image_position: 'left'|'right'; cta_label?: string; cta_url?: string; }
export interface PearlHighlightSnippetQuoteRecord { quote: string; attribution?: string; tone: 'light'|'brand'|'dark'; facebook_url?: string; x_url?: string; }
export interface PearlCtaSectionStandardRecord { heading: string; body?: string; background_image?: string; cta_label: string; cta_url: string; }
export interface PearlContactInfoStandardRecord { heading?: string; address: string; phone?: string; email?: string; map_url?: string; }
export interface PearlAreaLinkItem { link_label: string; link_url: string; sort: number; }
export interface PearlAreasServedLinksRecord { section_heading?: string; intro_text?: string; areas: PearlAreaLinkItem[]; }
export interface PearlFaqItem { question: string; answer: string; sort: number; }
export interface PearlFaqDropdownRecord { section_heading?: string; intro_text?: string; items: PearlFaqItem[]; }
export interface PearlCherryFinancingRecord { heading: string; body?: string; merchant_id?: string; cta_label?: string; cta_url?: string; }

export type PearlRecordByBlock = {
  inner_hero_standard: PearlInnerHeroStandardRecord;
  flex_content_section: PearlFlexContentSectionRecord;
  highlight_links: PearlHighlightLinksRecord;
  image_gallery_grid: PearlImageGalleryGridRecord;
  testimonial_list_standard: PearlTestimonialListStandardRecord;
  main_hero_standard: PearlMainHeroStandardRecord;
  icon_feature_cards: PearlIconFeatureCardsRecord;
  feature_image_content: PearlFeatureImageContentRecord;
  highlight_snippet_quote: PearlHighlightSnippetQuoteRecord;
  cta_section_standard: PearlCtaSectionStandardRecord;
  contact_info_standard: PearlContactInfoStandardRecord;
  areas_served_links: PearlAreasServedLinksRecord;
  faq_dropdown: PearlFaqDropdownRecord;
  cherry_financing: PearlCherryFinancingRecord;
};

export type PearlBlock = {
  [K in keyof PearlRecordByBlock]: {type: K; item: PearlRecordByBlock[K]; visual?: PearlVisualRef}
}[keyof PearlRecordByBlock];

export const PEARL_FIELD_KEYS = {
  inner_hero_standard: ['page_title','intro_paragraph','featured_image','image_alt','cta_label','cta_url'],
  flex_content_section: ['section_header','body_content','image','image_alt','header_tag','image_position'],
  highlight_links: ['section_heading','links'],
  image_gallery_grid: ['section_heading','grid_columns','images'],
  testimonial_list_standard: ['section_heading','intro_text','reviews'],
  main_hero_standard: ['heading','supporting_text','background_image','background_video_url','primary_cta_label','primary_cta_url'],
  icon_feature_cards: ['section_heading','intro_text','background_image','display_variant','items'],
  feature_image_content: ['heading','subheading','body','image','image_alt','image_position','cta_label','cta_url'],
  highlight_snippet_quote: ['quote','attribution','tone','facebook_url','x_url'],
  cta_section_standard: ['heading','body','background_image','cta_label','cta_url'],
  contact_info_standard: ['heading','address','phone','email','map_url'],
  areas_served_links: ['section_heading','intro_text','areas'],
  faq_dropdown: ['section_heading','intro_text','items'],
  cherry_financing: ['heading','body','merchant_id','cta_label','cta_url'],
} as const satisfies Record<keyof PearlRecordByBlock, readonly string[]>;
