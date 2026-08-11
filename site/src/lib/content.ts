import type { ContentBundle, PageRecord } from './contracts';
import { getFrozenContent } from './frozen';

let cached: ContentBundle | null = null;

/**
 * Content entry point. Uses the Directus adapter when a server-only token is
 * configured; otherwise falls back to the committed frozen extraction with
 * identical typed contracts.
 */
export async function getContent(): Promise<ContentBundle> {
  if (cached) return cached;
  if (process.env.DIRECTUS_SERVER_TOKEN) {
    const { getDirectusContent } = await import('./directus');
    cached = await getDirectusContent();
    return cached;
  }
  cached = getFrozenContent();
  return cached;
}

export async function getPages(): Promise<PageRecord[]> {
  return (await getContent()).pages;
}
