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
    expect(html).toContain('data-template-version="1.2.0"');
    expect(html).toContain('class="pearl-site-header"');
    expect(html).toContain('class="pearl-menu-toggle"');
    expect(html).toContain('aria-controls="pearl-primary-navigation"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="pearl-primary-navigation"');
    expect(html).toContain('class="pearl-site-footer"');
    const sequence=[...html.matchAll(/data-pearl-block="([^"]+)"/g)].map(match=>match[1]);
    expect(sequence.length).toBeGreaterThan(0);
    expect(sequence[0]).toBe('main_hero_standard');
    expect(sequence.every(type=>OFFICIAL_BLOCKS.has(type))).toBe(true);
  });

  it('generates CMS page routes instead of limiting previews to home',()=>{
    const route=readFileSync(join(SITE_ROOT,'src/pages/template-preview/pearl/[slug].astro'),'utf8');
    expect(route).toContain('getPublishedPearlPageRoutes');
    expect(route).toContain('getPearlPage(slug)');
  });

  it('keeps image descriptions, contact links and source-driven navigation',()=>{
    const html=readFileSync(join(SITE_ROOT,'dist/template-preview/pearl/index.html'),'utf8');
    const footer=readFileSync(join(SITE_ROOT,'src/components/pearl/PearlFooter.astro'),'utf8');
    const renderedFooter=html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0]??'';
    const images=[...html.matchAll(/<img\b[^>]*>/g)].map(match=>match[0]);
    expect(images.length).toBeGreaterThan(0);
    expect(images.every(image=>/\balt="[^"]*"/.test(image))).toBe(true);
    expect(renderedFooter).not.toContain('aria-label="Contact links"');
    expect(footer).toContain('aria-label="Contact links"');
    expect(footer).toContain("const isHomepage = slug === 'home';");
    expect(footer).toContain('{!isHomepage && <div class="pearl-wrap pearl-site-footer__contact">');
    expect(html).not.toContain('aria-label="Footer navigation"');
    const navigation=html.match(/<nav id="pearl-primary-navigation"[\s\S]*?<\/nav>/)?.[0]??'';
    const links=[...navigation.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
    expect(links.length).toBeGreaterThan(0);
    expect(links.every(match=>!match[1].startsWith('#')&&Boolean(match[2].trim()))).toBe(true);
  });

  it('keeps the sticky header scroll state stable and icon artwork bounded',()=>{
    const header=readFileSync(join(SITE_ROOT,'src/components/pearl/PearlHeader.astro'),'utf8');
    expect(header).toContain('const SCROLL_ENTER = 72');
    expect(header).toContain('const SCROLL_LEAVE = 32');
    expect(header).toContain('window.requestAnimationFrame');
    expect(header).not.toContain("window.scrollY > 56");
    expect(header).toContain('overflow: hidden; display: grid; place-items: center');
    expect(header).toContain('.pearl-brand img { width: 120%; max-width: none; height: auto; max-height: none;');
    expect(header).toContain('transform: translateY(-9%)');
    expect(header).not.toContain('.pearl-site-header--scrolled .pearl-brand img');
    expect(header).toContain('class="pearl-header-contact__map"');
    expect(header).toContain('class="pearl-header-contact__phone"');
    expect(header).toContain('aria-label="Lowen Perio on Instagram"');
    expect(header).toContain('aria-label="Lowen Perio on Google"');
    expect(header).toContain('.pearl-header-contact { max-width: 100%;');
    expect(header).not.toContain('width: min(100%, 330px)');
    expect(header).toContain('justify-items: end; gap: 5px; text-align: right;');
    expect(header).toContain('class="pearl-header-cta__icon"');
    expect(header).toContain('.pearl-header-cta span, .pearl-header-cta__icon { color: #fff !important; }');
    expect(header).toContain('font-size: 18px; font-weight: 400;');
    expect(header).toContain('letter-spacing: 1px;');
    expect(header).toContain('text-transform: uppercase;');
    expect(header).toContain('font-size: 14px; font-weight: 400;');
    expect(header).toContain('text-transform: none;');
    expect(header).toContain('padding-left: 190px;');
    expect(header).toContain('padding: 8px 0;');

    const layout=readFileSync(join(SITE_ROOT,'src/layouts/pearl/BaseLayout.astro'),'utf8');
    expect(layout).toContain('slug={slug}');

    const footer=readFileSync(join(SITE_ROOT,'src/components/pearl/PearlFooter.astro'),'utf8');
    expect(footer).toContain("const isHomepage = slug === 'home';");
    expect(footer).toContain("const isContactPage = slug === 'contact-us';");
    expect(footer).toContain('!isHomepage && mapEmbedUrl');
    expect(footer).toContain('!isHomepage && <div class="pearl-wrap pearl-site-footer__contact">');
    expect(footer).toContain('theme.office_hours');
    expect(footer).toContain('Follow Us:');
    expect(footer).toContain('background: #fbc9af');
    expect(footer).toContain('font-size: 25px');
    expect(footer).toContain('Copyright © 2010-2026');
    expect(footer).toContain('aria-label="Footer navigation"');
    expect(footer).toContain('background: var(--pearl-accent);');

    const icons=readFileSync(join(SITE_ROOT,'src/components/pearl/blocks/IconCircles.astro'),'utf8');
    expect(icons).toContain('grid-template-rows: minmax(38px, .55fr) auto');
    expect(icons).toContain('overflow: hidden');
    expect(icons).toContain('width: clamp(42px, 5vw, 62px)');
    expect(icons).toContain('.pearl-icons--overlay .pearl-icons__mark::before');
    expect(icons).toContain('grid-template-rows: 108px auto;');
    expect(icons).toContain('width: 104px; height: 102px;');
    expect(icons).toContain('transform: translateY(-7px);');
    expect(icons).toContain('inset: 9px;');
    expect(icons).toContain('color: #dae5f1;');
    expect(icons).toContain('font-weight: 400;');
    expect(icons).toContain('li:nth-child(2) .pearl-icons__mark strong { max-width: none; white-space: nowrap; }');
    expect(icons).toContain('width: min(39vw, 152px);');
    expect(icons).toContain('li:nth-child(2) .pearl-icons__mark span { width: 48px; height: 82px; }');
    expect(icons).toContain('.pearl-icons--services .pearl-icons__mark {');
    expect(icons).toContain('grid-template-rows: minmax(118px, 2fr) minmax(44px, 1fr);');
    expect(icons).toContain('max-width: 102px;');
    expect(icons).toContain('max-height: 96px;');
    expect(icons).toContain('.pearl-icons--services .pearl-icons__mark::before');
    expect(icons).toContain('li:nth-child(2) .pearl-icons__mark span { width: 50px; height: 60px; }');

    const welcome=readFileSync(join(SITE_ROOT,'src/components/pearl/blocks/FlexContentImage.astro'),'utf8');
    expect(welcome).toContain('tone="welcome"');
    expect(welcome).toContain('font-family: var(--pearl-font-body);');
    expect(welcome).toContain('white-space: nowrap;');

    const button=readFileSync(join(SITE_ROOT,'src/components/pearl/ui/Button.astro'),'utf8');
    expect(button).toContain("tone?: 'contrast' | 'light' | 'welcome'");
    expect(button).toContain('.pearl-button--welcome');
    expect(button).toContain('border-radius: 0;');
    expect(button).toContain('outline: 1px solid #b9cde2;');
    expect(button).toContain('font-weight: 400;');

    const innerHero=readFileSync(join(SITE_ROOT,'src/components/pearl/blocks/InnerHeroStandard.astro'),'utf8');
    expect(innerHero).toContain('background: color-mix(in srgb, var(--pearl-secondary) 84%, var(--pearl-primary));');
    expect(innerHero).toContain('.pearl-inner-standard { padding-block: 50px;');

    const pearlCss=readFileSync(join(SITE_ROOT,'src/styles/pearl.css'),'utf8');
    expect(pearlCss).toContain('.pearl-preview:not([data-page-slug="home"]) main > .pearl-section');
    expect(pearlCss).toContain('padding-block: clamp(32px, 4vw, 48px);');
    expect(pearlCss).toContain('padding-block: 38px;');

    const reviewBand=readFileSync(join(SITE_ROOT,'src/components/pearl/blocks/HighlightSnippetQuote.astro'),'utf8');
    expect(reviewBand).toContain("background: #e36966;");
    expect(reviewBand).toContain('sourceGoogleMatch');
    expect(reviewBand).toContain('aria-label="Read Lowen Perio reviews on Google"');
    expect(reviewBand).toContain('<svg viewBox="0 0 34.4 35"');
    expect(reviewBand).toContain('new IntersectionObserver');
    expect(reviewBand).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(reviewBand).not.toContain("content: 'G'");

    const doctors=readFileSync(join(SITE_ROOT,'src/components/pearl/blocks/FlexContentSection.astro'),'utf8');
    expect(doctors).toContain("section_header?.trim().toLowerCase() === 'meet the doctors'");
    expect(doctors).toContain('/More About Dr\\./i.test(body_content)');
    expect(doctors).toContain('border-bottom: 2px solid #9bb5c4');
    expect(doctors).toContain('border-radius: 0;');
    expect(doctors).toContain("new IntersectionObserver");
    expect(doctors).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
  });
});
