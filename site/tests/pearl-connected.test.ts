import {afterEach,describe,expect,it} from 'vitest';
import {buildPearlNavigation,getPearlPage} from '../src/lib/pearl/directus';

const originalToken=process.env.PEARL_DIRECTUS_TOKEN;
afterEach(()=>{if(originalToken===undefined)delete process.env.PEARL_DIRECTUS_TOKEN;else process.env.PEARL_DIRECTUS_TOKEN=originalToken;});

describe('connected Pearl adapter',()=>{
  it('builds ordered source subnavigation from flat Directus relations',()=>{
    const navigation=buildPearlNavigation([
      {id:'child',label:'Child',url:'/child/',sort:1,status:'published',parent:'parent'},
      {id:'parent',label:'Parent',url:'/parent/',sort:2,status:'published',parent:null},
      {id:'home',label:'Home',url:'/',sort:1,status:'published',parent:null},
    ]);
    expect(navigation.map(item=>item.label)).toEqual(['Home','Parent']);
    expect(navigation[1].children?.map(item=>item.label)).toEqual(['Child']);
  });
  it('fails closed when the dedicated server token is absent',async()=>{delete process.env.PEARL_DIRECTUS_TOKEN;await expect(getPearlPage()).rejects.toThrow('PEARL_DIRECTUS_TOKEN is required');});
  it('renders managed assets and official Directus annotations',async()=>{
    const{readFileSync}=await import('node:fs');const html=readFileSync('dist/template-preview/pearl/index.html','utf8');
    const footer=readFileSync('src/components/pearl/PearlFooter.astro','utf8');
    const renderedFooter=html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0]??'';
    const directus=(process.env.PEARL_DIRECTUS_URL??'https://pearlcms.foundryworks.ai').replace(/\/$/,'');
    expect(html).toContain(`${directus}/assets/`);
    expect(html).toContain(`data-directus-url="${directus}"`);
    expect(html).toContain('data-pearl-block="main_hero_standard"');
    expect(renderedFooter).not.toContain('https://www.google.com/maps?q=');
    expect(footer).toContain("const isContactPage = slug === 'contact-us';");
    expect(footer).toContain('const mapEmbedUrl = isContactPage && theme.address');
    expect(footer).toContain('{!isHomepage && mapEmbedUrl && (');
    expect(html.match(/data-directus=/g)?.length).toBeGreaterThanOrEqual(9);
    expect(html).toContain('collection:pearl_theme_settings');
    expect(html).toContain('collection:pearl_main_hero_standard');
    expect(html).toContain('VisualEditing.astro');
  });
});
