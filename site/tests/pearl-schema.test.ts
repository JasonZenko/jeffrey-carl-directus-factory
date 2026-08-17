import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {PEARL_COLLECTION_BY_BLOCK} from '../src/lib/pearl/directus';
import {REPO_ROOT} from './helpers';

describe('Pearl clean CMS boundary',()=>{
  it('uses pearlcms.foundryworks.ai as the only Pearl content authority',()=>{
    const source=readFileSync(`${REPO_ROOT}/site/src/lib/pearl/directus.ts`,'utf8');
    expect(source).toContain("'https://pearlcms.foundryworks.ai'");
    expect(source).not.toContain('weomcms.foundryworks.ai');
  });
  it('queries all official M2A collections and ordered child records',()=>{
    const source=readFileSync(`${REPO_ROOT}/site/src/lib/pearl/directus.ts`,'utf8');
    for(const collection of Object.values(PEARL_COLLECTION_BY_BLOCK))expect(source,collection).toContain(`item:${collection}.*`);
    for(const child of ['links','images','reviews','items','areas'])expect(source).toContain(`.${child}.*`);
  });
  it('keeps connected mode fail-closed and the review page noindex',()=>{
    const source=readFileSync(`${REPO_ROOT}/site/src/lib/pearl/directus.ts`,'utf8');
    expect(source).toContain("throw new Error('PEARL_DIRECTUS_TOKEN is required");
    expect(source).toContain('robots_index !== false');
    expect(source).toContain('robots_follow !== false');
  });
});
