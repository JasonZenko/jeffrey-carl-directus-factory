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
 * page/template/native Builder relationships into the shared typed contracts.
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

const COMPONENT_TYPE_BY_COLLECTION: Record<string, string> = {
  weo_component_heroes: 'hero',
  weo_component_text_media: 'text_media',
  weo_component_feature_grids: 'feature_grid',
  weo_component_processes: 'process',
  weo_component_faqs: 'faq',
  weo_component_ctas: 'cta',
  weo_component_testimonials: 'testimonials',
  weo_component_stats: 'stats',
  weo_component_galleries: 'gallery',
  weo_component_team_grids: 'team_grid',
  weo_component_embeds: 'embed',
  weo_component_forms: 'form',
};

function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code) => {
    const named: Record<string, string> = {
      amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: '\u00a0',
    };
    const key = String(code).toLowerCase();
    if (named[key] !== undefined) return named[key];
    const number = key.startsWith('#x')
      ? Number.parseInt(key.slice(2), 16)
      : Number.parseInt(key.slice(1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function plainText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function boundText(existingHtml: string, value: unknown): string {
  if (typeof value !== 'string') return existingHtml;
  return plainText(existingHtml) === value.replace(/\s+/g, ' ').trim()
    ? existingHtml
    : escapeHtml(value);
}

function bindAttribute(attributes: string, name: string, value: unknown): string {
  if (typeof value !== 'string') return attributes;
  const matcher = new RegExp(`(\\s${name}\\s*=\\s*)(["'])(.*?)\\2`, 'i');
  const match = matcher.exec(attributes);
  if (match && decodeHtml(match[3]) === value) return attributes;
  if (match) {
    return attributes.replace(matcher, `${match[1]}"${escapeAttribute(value)}"`);
  }
  return `${attributes} ${name}="${escapeAttribute(value)}"`;
}

function bindFeatureGrid(component: Record<string, any>): string {
  const items = [...(component.items ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  let itemIndex = 0;
  return String(component.source_html ?? '').replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (anchor, attributes: string, body: string) => {
      if (!/\bclass\s*=\s*["'][^"']*\bTPcta\b/i.test(attributes)) return anchor;
      const item = items[itemIndex++];
      if (!item) return anchor;
      let nextAttributes = bindAttribute(attributes, 'href', item.link_url);
      nextAttributes = bindAttribute(nextAttributes, 'title', item.description);
      const nextBody = body.replace(
        /(<h3\b[^>]*>)([\s\S]*?)(<\/h3>)/i,
        (_heading, open: string, text: string, close: string) =>
          `${open}${boundText(text, item.title ?? item.link_label)}${close}`,
      );
      return `<a${nextAttributes}>${nextBody}</a>`;
    },
  );
}

function bindTestimonials(component: Record<string, any>): string {
  const item = [...(component.items ?? [])]
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0];
  let html = String(component.source_html ?? '');
  html = html.replace(
    /(<h2\b[^>]*>)([\s\S]*?)(<\/h2>)/i,
    (_heading, open: string, text: string, close: string) =>
      `${open}${boundText(text, component.heading)}${close}`,
  );
  if (item) {
    html = html.replace(
      /(<div\b(?=[^>]*\bdata-aos=["']fade-down["'])[^>]*>)([\s\S]*?)(<\/div>)/i,
      (_quote, open: string, text: string, close: string) =>
        `${open}${boundText(text, item.quote)}${close}`,
    );
  }
  return html;
}

function bindTeamGrid(component: Record<string, any>): string {
  const members = [...(component.members ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  let memberIndex = 0;
  return String(component.source_html ?? '').replace(
    /(<h2\b[^>]*>)([\s\S]*?)(<\/h2>\s*<br\b[^>]*>)([\s\S]*?)(<br\b[^>]*>\s*<a\b)([^>]*\bclass=["'][^"']*\bTPbtn-primary\b[^"']*["'][^>]*>)([\s\S]*?)(<\/a>)/gi,
    (memberHtml, open: string, heading: string, afterHeading: string, bio: string,
      anchorOpen: string, anchorAttributes: string, label: string, anchorClose: string) => {
      const member = members[memberIndex++];
      if (!member) return memberHtml;
      const nextHeading = boundText(heading, `Meet ${member.name}`);
      const nextBio = boundText(bio, member.bio);
      const nextAttributes = bindAttribute(anchorAttributes.slice(0, -1), 'href', member.profile_url);
      return `${open}${nextHeading}${afterHeading}${nextBio}${anchorOpen}${nextAttributes}>${label}${anchorClose}`;
    },
  );
}

export function componentHtml(componentType: string, component: Record<string, any>): string {
  if (!component) return '';
  switch (componentType) {
    case 'hero':
      return component.subheading ?? '';
    case 'cta':
      return component.body ?? '';
    case 'text_media': {
      if (typeof component.body_html === 'string') return component.body_html;
      const paragraphs = component.paragraphs;
      if (Array.isArray(paragraphs)) return paragraphs.join('');
      return typeof paragraphs === 'string' ? paragraphs : '';
    }
    case 'feature_grid':
      return bindFeatureGrid(component);
    case 'testimonials':
      return bindTestimonials(component);
    case 'team_grid':
      return bindTeamGrid(component);
    case 'embed':
    case 'form':
      return component.source_html ?? '';
    default:
      return component.body ?? component.source_html ?? component.html ?? '';
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
      `/items/weo_page_builder?filter[page][site][_eq]=${siteRow.id}&limit=-1&sort=sort` +
      '&fields=id,page,sort,collection,' +
      'item:weo_component_heroes.*,' +
      'item:weo_component_text_media.*,' +
      'item:weo_component_feature_grids.*,item:weo_component_feature_grids.items.*,' +
      'item:weo_component_processes.*,item:weo_component_processes.steps.*,' +
      'item:weo_component_faqs.*,item:weo_component_faqs.items.*,' +
      'item:weo_component_ctas.*,' +
      'item:weo_component_testimonials.*,item:weo_component_testimonials.items.*,' +
      'item:weo_component_stats.*,' +
      'item:weo_component_galleries.*,item:weo_component_galleries.items.*,' +
      'item:weo_component_team_grids.*,item:weo_component_team_grids.members.*,' +
      'item:weo_component_embeds.*,item:weo_component_forms.*', token),
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
    const componentType = COMPONENT_TYPE_BY_COLLECTION[row.collection] ?? row.collection;
    const component = row.item ?? null;
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
