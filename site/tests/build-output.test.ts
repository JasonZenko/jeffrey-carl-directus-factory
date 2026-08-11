import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pages, SITE_ROOT } from './helpers';

const DIST = join(SITE_ROOT, 'dist');
const distReady = existsSync(DIST);

describe('build output', () => {
  it('dist exists (run `npm run build` first)', () => {
    expect(distReady, 'site/dist missing — run npm run build before tests').toBe(true);
  });

  it.runIf(distReady)('emits all 78 preserved legacy routes', () => {
    for (const page of pages) {
      const file = join(DIST, page.legacy_path, 'index.html');
      expect(existsSync(file), page.legacy_path).toBe(true);
    }
  });

  it.runIf(distReady)('every route renders fidelity root, articles, metadata and noindex', () => {
    for (const page of pages) {
      const html = readFileSync(join(DIST, page.legacy_path, 'index.html'), 'utf8');
      expect(html, page.legacy_path).toContain('data-fidelity-root');
      expect(html, page.legacy_path).toContain(`data-family="${page.family}"`);
      expect(html, page.legacy_path).toContain(`data-template="${page.template}"`);
      expect(html, page.legacy_path).toContain('<meta name="robots" content="noindex, nofollow"');
      const escapedTitle = page.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      expect(html, page.legacy_path).toContain(`<title>${escapedTitle}</title>`);
      expect(html, page.legacy_path).toContain(`rel="canonical" href="${page.canonical}"`);
      const articleIds = [...page.blocks.map((b) => b.article_id)];
      const expectedIds = [...new Set(articleIds)];
      for (const id of expectedIds) {
        expect(html, `${page.legacy_path} ${id}`).toContain(`data-source-article="${id}"`);
      }
      // Chrome stays outside the fidelity root.
      const mainStart = html.indexOf('<main data-fidelity-root');
      const headerEnd = html.indexOf('</header>');
      expect(mainStart, page.legacy_path).toBeGreaterThanOrEqual(0);
      expect(headerEnd, page.legacy_path).toBeGreaterThanOrEqual(0);
      expect(headerEnd, page.legacy_path).toBeLessThan(mainStart);
    }
  });

  it.runIf(distReady)('robots.txt blocks all crawlers', () => {
    const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
    expect(robots).toContain('Disallow: /');
  });

  it.runIf(distReady)('root renders the migrated homepage and is noindexed', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(html).toContain('data-fidelity-root');
    expect(html).toContain('data-family="home"');
    expect(html).toContain('data-template="homepage"');
    expect(html).toContain('fLOLbodJq-o');
    expect(html.match(/class="TPcta"/g) ?? []).toHaveLength(4);
    expect(html).not.toContain('migration review surface');
  });

  it.runIf(distReady)('shared chrome restores source navigation, appointment icon, map and footer hierarchy', () => {
    for (const page of pages) {
      const html = readFileSync(join(DIST, page.legacy_path, 'index.html'), 'utf8');
      expect(html, page.legacy_path).toContain('class="site-header__calendar"');
      expect(html, page.legacy_path).toContain('class="site-footer__map"');
      expect(html, page.legacy_path).toContain('maps.google.com/maps?');
      expect(html, page.legacy_path).toContain('class="site-footer__related"');
    }
    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(home.match(/class="site-nav__submenu"/g) ?? []).toHaveLength(3);
    expect(home).toContain('Meet Dr. Jeffrey D. Carl');
    expect(home).toContain('Restorative Dentistry');
    expect(home).toContain('Patient Forms');
    expect(home).toContain('3120 Pacific PL SW, Albany, OR 97321-3568');
  });

  it.runIf(distReady)('no rendered page references the live source host in src/href', () => {
    for (const page of pages) {
      const html = readFileSync(join(DIST, page.legacy_path, 'index.html'), 'utf8');
      const refs = html.match(/(?:src|href)="https?:\/\/(?:www\.)?jeffreycarldmd\.com[^"]*"/g) ?? [];
      expect(refs, page.legacy_path).toEqual([]);
    }
  });
});
