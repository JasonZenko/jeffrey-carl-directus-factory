import { afterEach, describe, expect, it } from 'vitest';
import { getPearlPage } from '../src/lib/pearl/directus';

const originalToken = process.env.PEARL_DIRECTUS_TOKEN;
afterEach(() => {
  if (originalToken === undefined) delete process.env.PEARL_DIRECTUS_TOKEN;
  else process.env.PEARL_DIRECTUS_TOKEN = originalToken;
});

describe('connected Pearl adapter', () => {
  it('fails closed when the dedicated server token is absent', async () => {
    delete process.env.PEARL_DIRECTUS_TOKEN;
    await expect(getPearlPage()).rejects.toThrow('PEARL_DIRECTUS_TOKEN is required');
  });

  it('renders managed Directus assets in the connected build', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync('dist/template-preview/pearl/index.html', 'utf8');
    expect(html).toContain('https://weomcms.foundryworks.ai/assets/');
    expect(html).toContain('data-pearl-block="main_hero"');
    expect(html).toContain('data-pearl-block="inner_hero_cta"');
  });
});
