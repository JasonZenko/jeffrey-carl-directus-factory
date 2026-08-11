import type {
  Block,
  BlockType,
  ContentBundle,
  PageRecord,
  SiteRecord,
  TemplateRecord,
} from './contracts';

/**
 * Directus build adapter. Reads published content from the clean WEO master
 * using a server-only static token (DIRECTUS_SERVER_TOKEN — never prefixed
 * PUBLIC_, only read at build time on the server) and maps native
 * page/template/block relationships into the shared typed contracts.
 *
 * Block types are recovered from the component internal_name suffix
 * (`<blockId>::<type>`) written by scripts/directus_import.mjs, and block
 * provenance from the mirrored weo_page_sections rows (source_key = block id).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai';
const SITE_SLUG = process.env.DIRECTUS_SITE_SLUG ?? 'jeffrey-carl-dmd';

interface DirectusList<T> {
  data: T[];
}

async function api<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${DIRECTUS_URL.replace(/\/$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Directus ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}

const BLOCK_TYPE_SUFFIX = /::([a-z_]+)$/;

function componentHtml(componentType: string, component: Record<string, any>): string {
  if (!component) return '';
  switch (componentType) {
    case 'hero':
      return component.subheading ?? '';
    case 'cta':
      return component.body ?? '';
    case 'text_media': {
      const paragraphs = component.paragraphs;
      if (Array.isArray(paragraphs)) return paragraphs.join('');
      return typeof paragraphs === 'string' ? paragraphs : '';
    }
    default:
      return component.body ?? component.html ?? '';
  }
}

export async function getDirectusContent(): Promise<ContentBundle> {
  const token = process.env.DIRECTUS_SERVER_TOKEN;
  if (!token) throw new Error('DIRECTUS_SERVER_TOKEN is required for the Directus adapter');

  const sites = await api<DirectusList<any>>(
    `/items/weo_sites?filter[slug][_eq]=${encodeURIComponent(SITE_SLUG)}&limit=1&fields=*`, token);
  const siteRow = sites.data[0];
  if (!siteRow) throw new Error(`Directus site not found: ${SITE_SLUG}`);

  const [pageRows, blockRows, sectionRows, templateRows] = await Promise.all([
    api<DirectusList<any>>(
      `/items/weo_pages?filter[site][_eq]=${siteRow.id}&filter[status][_eq]=published&limit=-1&fields=*,template.*`, token),
    api<DirectusList<any>>(
      `/items/weo_page_blocks?filter[page][site][_eq]=${siteRow.id}&limit=-1&sort=sort` +
      '&fields=*,hero.*,text_media.*,feature_grid.*,process.*,faq.*,cta.*,testimonials.*,stats.*,gallery.*,team_grid.*', token),
    api<DirectusList<any>>(
      `/items/weo_page_sections?filter[page][site][_eq]=${siteRow.id}&limit=-1&sort=sort&fields=*`, token),
    api<DirectusList<any>>(
      '/items/weo_page_templates?limit=-1&fields=*,blocks.*', token),
  ]);

  const sectionsByPage = new Map<string, any[]>();
  for (const section of sectionRows.data) {
    const list = sectionsByPage.get(section.page) ?? [];
    list.push(section);
    sectionsByPage.set(section.page, list);
  }

  const blocksByPage = new Map<string, Block[]>();
  for (const row of blockRows.data) {
    const componentType: string = row.component_type;
    const component = row[componentType] ?? null;
    const internalName: string = component?.internal_name ?? '';
    const suffix = BLOCK_TYPE_SUFFIX.exec(internalName);
    const type = (suffix?.[1] ?? componentType) as BlockType;
    const section = (sectionsByPage.get(row.page) ?? []).find((s) => s.sort === row.sort);
    const blockId = section?.source_key ?? `${row.page}#b${row.sort}`;
    const block: Block = {
      id: blockId,
      sort: row.sort,
      type,
      article_id: section?.css_class?.replace('article-', '') ?? 'ArtID1',
      html: componentHtml(componentType, component) || section?.body_html || '',
      component: component ?? {},
      provenance: {
        source_url: '',
        source_html_sha256: '',
        article_id: section?.css_class?.replace('article-', '') ?? 'ArtID1',
        band_index: 0,
        block_index: row.sort - 1,
        fragment_sha256: '',
        extractor: 'directus-adapter',
        ...(section?.form_config?.provenance ?? {}),
      },
    };
    const list = blocksByPage.get(row.page) ?? [];
    list.push(block);
    blocksByPage.set(row.page, list);
  }

  const pages: PageRecord[] = pageRows.data.map((row: any) => ({
    source_id: row.source_id,
    legacy_path: row.legacy_path,
    source_url: row.source_url,
    family: row.template_class,
    page_type: row.page_type,
    template: typeof row.template === 'object' ? row.template?.slug : row.template,
    status: row.status,
    title: row.title,
    meta_description: row.meta_description ?? '',
    canonical: row.canonical_url ?? '',
    source_h1: row.source_h1 ?? [],
    schema_json: row.schema_json ?? [],
    robots_index: row.robots_index ?? false,
    robots_follow: row.robots_follow ?? false,
    source_html_sha256: row.source_text_sha256 ?? '',
    blocks: (blocksByPage.get(row.id) ?? []).sort((a, b) => a.sort - b.sort),
  }));

  const site: SiteRecord = {
    name: siteRow.name,
    slug: siteRow.slug,
    source_url: siteRow.source_url ?? '',
    status: siteRow.status,
    indexing_enabled: siteRow.indexing_enabled ?? false,
    phone: siteRow.phone ?? '',
    phone_href: siteRow.phone_href ?? '',
    address: siteRow.navigation?.address ?? siteRow.contact?.address ?? '',
    appointment_path: siteRow.navigation?.appointment_path ?? '',
    logo: siteRow.navigation?.logo ?? '',
    home_hero_image: siteRow.navigation?.home_hero_image ?? '',
    home_hero_video_id: siteRow.navigation?.home_hero_video_id ?? '',
    inner_hero_image: siteRow.navigation?.inner_hero_image ?? '',
    map_embed_url: siteRow.navigation?.map_embed_url ?? '',
    navigation: (siteRow.navigation?.items ?? siteRow.navigation ?? []) as SiteRecord['navigation'],
    footer: siteRow.footer ?? { text: '', copyright: '', links: [] },
    homepage: siteRow.homepage ?? { legacy_path: '' },
  };

  const templates: TemplateRecord[] = templateRows.data.map((row: any) => ({
    slug: row.slug,
    name: row.name,
    family: row.internal_name,
    page_type: row.page_type,
    blocks: (row.blocks ?? []).map((b: any) => ({
      sort: b.sort,
      component_type: b.component_type,
      required: b.required ?? false,
    })),
  }));

  return { site, templates, pages, source: 'directus' };
}
