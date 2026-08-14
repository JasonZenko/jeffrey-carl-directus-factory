import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {PEARL_FIELD_KEYS} from '../src/components/pearl/types';
import {PEARL_COLLECTION_BY_BLOCK} from '../src/lib/pearl/directus';
import {SITE_ROOT} from './helpers';

const REQUIRED_COMMON=['inner_hero_standard','flex_content_section','highlight_links','image_gallery_grid','testimonial_list_standard'];
const REQUIRED_HOMEPAGE=['main_hero_standard','icon_feature_cards','feature_image_content','highlight_snippet_quote'];
const OPTIONAL=['cta_section_standard','contact_info_standard','areas_served_links','faq_dropdown','cherry_financing'];

describe('Pearl 1.0 official adapter contract',()=>{
  it('defines exactly the approved 14-block library',()=>{expect(Object.keys(PEARL_COLLECTION_BY_BLOCK).sort()).toEqual([...REQUIRED_COMMON,...REQUIRED_HOMEPAGE,...OPTIONAL].sort());});
  it('uses clean Pearl-only collection names',()=>{for(const collection of Object.values(PEARL_COLLECTION_BY_BLOCK)){expect(collection).toMatch(/^pearl_[a-z_]+$/);expect(collection).not.toContain('weo_');}});
  it('binds every official block to a unique collection and field contract',()=>{expect(new Set(Object.values(PEARL_COLLECTION_BY_BLOCK)).size).toBe(14);expect(Object.keys(PEARL_FIELD_KEYS).sort()).toEqual(Object.keys(PEARL_COLLECTION_BY_BLOCK).sort());});
  it('keeps required migration fields explicit',()=>{
    expect(PEARL_FIELD_KEYS.inner_hero_standard).toContain('page_title');
    expect(PEARL_FIELD_KEYS.flex_content_section).toContain('body_content');
    expect(PEARL_FIELD_KEYS.highlight_links).toContain('links');
    expect(PEARL_FIELD_KEYS.image_gallery_grid).toContain('images');
    expect(PEARL_FIELD_KEYS.testimonial_list_standard).toContain('reviews');
  });
  it('binds Visual Editor to the active CMS build rather than the golden instance',()=>{
    const source=readFileSync(join(SITE_ROOT,'src/components/pearl/VisualEditing.astro'),'utf8');
    expect(source).toContain('import.meta.env.PEARL_DIRECTUS_URL');
    expect(source).toContain('data-directus-url={directusUrl}');
    expect(source).not.toMatch(/apply\(\{\s*directusUrl:\s*['"]https:\/\//);
  });
});
