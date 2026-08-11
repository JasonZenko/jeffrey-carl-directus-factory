import type { ContentBundle, PageRecord, SiteRecord, TemplateRecord } from './contracts';
import site from '../content/frozen/site.json';
import templates from '../content/frozen/templates.json';
import pages from '../content/frozen/pages.json';

/**
 * Frozen-data fallback: loads the deterministic extraction output committed
 * to this repository. Uses the identical typed contracts as the Directus
 * adapter so disconnected Git review renders the same bytes.
 */
export function getFrozenContent(): ContentBundle {
  return {
    site: site as SiteRecord,
    templates: templates as TemplateRecord[],
    pages: pages as PageRecord[],
    source: 'frozen',
  };
}
