import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {PEARL_FIELD_KEYS} from '../src/components/pearl/types';
import {SITE_ROOT} from './helpers';

const COMPONENTS = [
  'MainHero','InnerHeroStandard','FlexContentSection','HighlightLinks','ImageGalleryGrid','TestimonialListStandard',
  'IconCircles','FlexContentImage','HighlightSnippetQuote','CtaSectionStandard','ContactInfoStandard','AreasServedStandard','FaqDropdown','CherryFinancing',
];
const OFFICIAL_BLOCKS = new Set(Object.keys(PEARL_FIELD_KEYS));

describe('Pearl official block surface', () => {
  it('implements all 14 official blocks behind one renderer', () => {
    expect(Object.keys(PEARL_FIELD_KEYS)).toHaveLength(14);
    for (const component of COMPONENTS) expect(existsSync(join(SITE_ROOT,`src/components/pearl/blocks/${component}.astro`)),component).toBe(true);
    const renderer=readFileSync(join(SITE_ROOT,'src/components/pearl/blocks/BlockRenderer.astro'),'utf8');
    for(const key of Object.keys(PEARL_FIELD_KEYS)) expect(renderer,key).toContain(`block.type==='${key}'`);
  });

  it('keeps each official field contract non-empty and deterministic',()=>{
    for(const [key,fields] of Object.entries(PEARL_FIELD_KEYS)){
      expect(fields.length,key).toBeGreaterThan(0);
      expect(new Set(fields).size,key).toBe(fields.length);
    }
  });

  it('builds a composable noindex Pearl homepage from approved blocks',()=>{
    const output=join(SITE_ROOT,'dist/template-preview/pearl/index.html');
    expect(existsSync(output),'run npm run build before tests').toBe(true);
    const html=readFileSync(output,'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(html).toContain('data-template-adapter="pearl"');
    expect(html).toContain('data-template-version="1.0.0"');
    expect(html).toContain('class="pearl-site-header"');
    expect(html).toContain('class="pearl-menu-toggle"');
    expect(html).toContain('aria-controls="pearl-primary-navigation"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="pearl-primary-navigation"');
    expect(html).toContain('class="pearl-site-footer"');
    const sequence=[...html.matchAll(/data-pearl-block="([^"]+)"/g)].map(match=>match[1]);
    expect(sequence.length).toBeGreaterThan(0);
    expect(sequence[0]).toBe('main_hero_standard');
    expect(sequence).toContain('contact_info_standard');
    expect(sequence.every(type=>OFFICIAL_BLOCKS.has(type))).toBe(true);
  });

  it('generates CMS page routes instead of limiting previews to home',()=>{
    const route=readFileSync(join(SITE_ROOT,'src/pages/template-preview/pearl/[slug].astro'),'utf8');
    expect(route).toContain('getPublishedPearlPageRoutes');
    expect(route).toContain('getPearlPage(slug)');
  });

  it('keeps image descriptions, social navigation and lowercase primary navigation',()=>{
    const html=readFileSync(join(SITE_ROOT,'dist/template-preview/pearl/index.html'),'utf8');
    expect(html).toContain('alt="Dentist welcoming a patient in a bright treatment room"');
    expect(html).toContain('alt="Dr. Amanda Pearl"');
    expect(html).toContain('aria-label="Contact links"');
    expect(html).toContain('aria-label="Social media"');
    for(const [href,label] of [['#top','home'],['#services','services'],['#about','about'],['#contact','contact']]) expect(html).toMatch(new RegExp(`<a href="${href}"[^>]*>${label}</a>`));
  });
});
