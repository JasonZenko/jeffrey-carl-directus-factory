#!/usr/bin/env node
/**
 * Directus import/provision script for the Jeffrey Carl migration.
 *
 * Creates, in the existing clean WEO master:
 *   - one weo_sites record (slug: jeffrey-carl-dmd), noindex flags set
 *   - managed assets (directus_files + weo_media_assets rows with sha256)
 *   - all 78 weo_pages rows with template FK (looked up, never created)
 *   - native component records + ordered weo_page_blocks relationships
 *   - mirrored weo_page_sections rows carrying per-block provenance
 *   - weo_navigation_items, weo_internal_links, draft weo_forms
 *   - a weo_migration_runs receipt row
 *
 * Global template definitions (weo_page_templates) are READ ONLY: the six
 * required slugs must already exist or the import aborts listing the gaps.
 *
 * Usage:
 *   DIRECTUS_SERVER_TOKEN=... node scripts/directus_import.mjs [--dry-run]
 * Env:
 *   DIRECTUS_URL           (default https://weomcms.foundryworks.ai)
 *   DIRECTUS_SERVER_TOKEN  server-only static token, never committed
 *   DIRECTUS_SITE_SLUG     (default jeffrey-carl-dmd)
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FROZEN = join(ROOT, 'site/src/content/frozen');
const ASSETS_DIR = join(ROOT, 'site/public/assets');

const DIRECTUS_URL = (process.env.DIRECTUS_URL ?? 'https://weomcms.foundryworks.ai').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN ?? '';
const SITE_SLUG = process.env.DIRECTUS_SITE_SLUG ?? 'jeffrey-carl-dmd';
const DRY_RUN = process.argv.includes('--dry-run');

const REQUIRED_TEMPLATE_SLUGS = [
  'homepage',
  'service-treatment',
  'about-team',
  'resource-article',
  'contact-conversion',
  'location-practice',
];

const COMPONENT_COLLECTION_BY_CARRIER = {
  hero: 'weo_component_heroes',
  text_media: 'weo_component_text_media',
  feature_grid: 'weo_component_feature_grids',
  process: 'weo_component_processes',
  faq: 'weo_component_faqs',
  cta: 'weo_component_ctas',
  testimonials: 'weo_component_testimonials',
  stats: 'weo_component_stats',
  gallery: 'weo_component_galleries',
  team_grid: 'weo_component_team_grids',
};

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const state = {
  created: {},
  updated: {},
  skipped: {},
  errors: [],
};

function tally(kind, action) {
  state[action][kind] = (state[action][kind] ?? 0) + 1;
}

async function api(method, path, body) {
  // Some clean-master alias fields are metadata-only and cannot be selected as
  // physical database columns. Directus otherwise returns every field after a
  // mutation, so constrain write responses to the created/updated id.
  const responsePath = ['POST', 'PATCH'].includes(method)
    ? `${path}${path.includes('?') ? '&' : '?'}fields=id`
    : path;
  const url = `${DIRECTUS_URL}${responsePath}`;
  if (DRY_RUN && method !== 'GET') {
    console.log(`[dry-run] ${method} ${path}`);
    return { data: { id: `dry-run-${path}` } };
  }
  if (!TOKEN && !DRY_RUN) throw new Error('DIRECTUS_SERVER_TOKEN is required (or use --dry-run)');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    if (DRY_RUN && method === 'GET') {
      console.warn(`[dry-run] GET ${path} -> ${response.status}; continuing with empty data`);
      return { data: [] };
    }
    const text = await response.text();
    throw new Error(`Directus ${method} ${path} -> ${response.status}: ${text.slice(0, 4000)}`);
  }
  if (response.status === 204) return {};
  return response.json();
}

async function apiList(path) {
  const result = await api('GET', path);
  return result.data ?? [];
}

async function uploadFile(name, bytes) {
  if (DRY_RUN) {
    console.log(`[dry-run] POST /files ${name}`);
    return `dry-run-file-${name}`;
  }
  const form = new FormData();
  form.append('file', new Blob([bytes]), name);
  const response = await fetch(`${DIRECTUS_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  if (!response.ok) throw new Error(`file upload failed for ${name}: ${response.status}`);
  return (await response.json()).data.id;
}

function componentPayload(block) {
  const c = block.component;
  const base = { internal_name: `${block.id}::${block.type}`, status: 'published' };
  switch (block.type) {
    case 'hero':
      return {
        collection: 'weo_component_heroes',
        carrier: 'hero',
        payload: {
          ...base,
          heading: c.heading,
          subheading: c.subheading ?? block.html,
          image_alt: c.image_alt,
          primary_cta_label: c.primary_cta_label,
          primary_cta_url: c.primary_cta_url,
        },
      };
    case 'cta':
      return {
        collection: 'weo_component_ctas',
        carrier: 'cta',
        payload: {
          ...base,
          heading: c.heading,
          body: c.body ?? block.html,
          primary_label: c.primary_label,
          primary_url: c.primary_url,
          secondary_label: c.secondary_label,
          secondary_url: c.secondary_url,
        },
      };
    case 'text_media':
      return {
        collection: 'weo_component_text_media',
        carrier: 'text_media',
        payload: {
          ...base,
          heading: c.heading,
          paragraphs: c.paragraphs ?? [block.html],
          image_alt: c.image_alt,
          image_position: c.image_position,
        },
      };
    // The Directus block palette has no embed/form FK; both are carried as
    // governed rich text in weo_component_text_media with the exact type
    // preserved in the internal_name suffix, mirroring the frozen contract.
    case 'embed':
      return {
        collection: 'weo_component_text_media',
        carrier: 'text_media',
        payload: { ...base, heading: c.heading ?? null, paragraphs: [block.html] },
      };
    case 'form':
      return {
        collection: 'weo_component_text_media',
        carrier: 'text_media',
        payload: { ...base, heading: c.heading ?? null, paragraphs: [block.html] },
      };
    default:
      throw new Error(`no component mapping for block type ${block.type}`);
  }
}

async function main() {
  const site = JSON.parse(readFileSync(join(FROZEN, 'site.json'), 'utf8'));
  const pages = JSON.parse(readFileSync(join(FROZEN, 'pages.json'), 'utf8'));
  const assetsManifest = JSON.parse(
    readFileSync(join(ROOT, 'source-freeze/manifests/assets.json'), 'utf8'));

  console.log(`target: ${DIRECTUS_URL} site: ${SITE_SLUG} dry-run: ${DRY_RUN}`);

  // 1. Global templates: look up only, never create or modify.
  const templates = await apiList('/items/weo_page_templates?limit=-1&fields=id,slug,name');
  const templateBySlug = new Map(templates.map((t) => [t.slug, t]));
  const missing = REQUIRED_TEMPLATE_SLUGS.filter((slug) => !templateBySlug.has(slug));
  if (missing.length && !(DRY_RUN && templates.length === 0)) {
    throw new Error(
      `Missing global page templates in the clean master: ${missing.join(', ')}. ` +
      'Global template definitions are owned outside the migration pass; create them there first.');
  }
  if (missing.length) {
    console.warn(`[dry-run] template lookup unavailable; would verify slugs: ${REQUIRED_TEMPLATE_SLUGS.join(', ')}`);
  }

  // 2. Site record (upsert by slug).
  let siteRow = (await apiList(
    `/items/weo_sites?filter[slug][_eq]=${encodeURIComponent(SITE_SLUG)}&limit=1&fields=id`))[0];
  const sitePayload = {
    status: 'published',
    name: site.name,
    slug: SITE_SLUG,
    source_url: site.source_url,
    primary_domain: 'review.noindex.invalid',
    navigation: {
      items: site.navigation,
      address: site.address,
      appointment_path: site.appointment_path,
      logo: site.logo,
      home_hero_image: site.home_hero_image,
      home_hero_video_id: site.home_hero_video_id,
      inner_hero_image: site.inner_hero_image,
      map_embed_url: site.map_embed_url,
    },
    footer: site.footer,
    homepage: site.homepage,
    contact: {
      phone: site.phone,
      phone_href: site.phone_href,
      address: site.address,
      source_url: site.source_url,
    },
    phone: site.phone,
    phone_href: site.phone_href,
    indexing_enabled: false,
  };
  if (siteRow) {
    await api('PATCH', `/items/weo_sites/${siteRow.id}`, sitePayload);
    tally('sites', 'updated');
  } else {
    siteRow = (await api('POST', '/items/weo_sites', sitePayload)).data;
    tally('sites', 'created');
  }
  const siteId = siteRow.id;

  // 3. Managed assets: upload bytes, register weo_media_assets (skip existing).
  const existingAssets = await apiList(
    `/items/weo_media_assets?filter[site][_eq]=${siteId}&limit=-1&fields=source_key,directus_file`);
  const assetFileByKey = new Map(existingAssets.map((a) => [a.source_key, a.directus_file]));
  for (const asset of assetsManifest) {
    const name = asset.localPath.split('/').pop();
    if (assetFileByKey.has(name)) {
      tally('assets', 'skipped');
      continue;
    }
    const bytes = readFileSync(join(ASSETS_DIR, name));
    if (sha256(bytes) !== asset.sha256) throw new Error(`asset hash mismatch: ${name}`);
    const fileId = await uploadFile(name, bytes);
    await api('POST', '/items/weo_media_assets', {
      site: siteId,
      source_key: name,
      source_url: asset.url,
      portable_path: `/assets/${name}`,
      sha256: asset.sha256,
      directus_file: fileId,
      managed_url: `/assets/${name}`,
    });
    assetFileByKey.set(name, fileId);
    tally('assets', 'created');
  }

  // 4. Pages with template FK and ordered native blocks.
  const existingPages = await apiList(
    `/items/weo_pages?filter[site][_eq]=${siteId}&limit=-1&fields=id,legacy_path`);
  const pageIdByPath = new Map(existingPages.map((p) => [p.legacy_path, p.id]));

  for (const page of pages) {
    const pageImages = page.blocks
      .filter((block) => block.component.image)
      .map((block) => ({
        path: block.component.image,
        alt: block.component.image_alt ?? '',
        article_id: block.article_id,
        source_url: block.provenance.source_url,
      }));
    const hostedVideoEmbeds = page.blocks
      .filter((block) => block.type === 'embed' && block.component.embed_url)
      .map((block) => ({
        url: block.component.embed_url,
        provider: block.component.provider ?? null,
        article_id: block.article_id,
      }));
    const pageSections = page.blocks.map((block) => ({
      source_key: block.id,
      sort: block.sort,
      section_type: block.type,
      heading: block.component.heading ?? null,
      body_html: block.html,
      source_html: block.html,
      image_path: block.component.image ?? null,
      image_alt: block.component.image_alt ?? null,
      embed_url: block.component.embed_url ?? null,
      cta_label: block.component.primary_label ?? block.component.primary_cta_label ?? null,
      cta_url: block.component.primary_url ?? block.component.primary_cta_url ?? null,
      css_class: `article-${block.article_id}`,
      form_config: { provenance: block.provenance },
      status: 'published',
    }));
    const pagePayload = {
      status: 'published',
      site: siteId,
      source_id: page.source_id,
      source_url: page.source_url,
      legacy_path: page.legacy_path,
      page_type: page.page_type,
      template_class: page.family,
      title: page.title,
      meta_description: page.meta_description,
      canonical_url: page.canonical,
      visible_title: page.source_h1[0] ?? page.title,
      body_html: page.blocks.map((block) => block.html).join('\n'),
      source_h1: page.source_h1,
      sections: pageSections,
      images: pageImages,
      hosted_video_embeds: hostedVideoEmbeds,
      schema_json: page.schema_json,
      source_text_sha256: page.source_html_sha256,
      robots_index: false,
      robots_follow: false,
      workflow_status: 'migrated',
      template: templateBySlug.get(page.template)?.id ?? `dry-run-template-${page.template}`,
    };
    let pageId = pageIdByPath.get(page.legacy_path);
    if (pageId) {
      // Re-import relationships deterministically.
      const oldBlocks = await apiList(
        `/items/weo_page_blocks?filter[page][_eq]=${pageId}&limit=-1&fields=id,component_type,hero,text_media,feature_grid,process,faq,cta,testimonials,stats,gallery,team_grid`);
      if (oldBlocks.length) {
        await api('DELETE', `/items/weo_page_blocks`, { keys: oldBlocks.map((b) => b.id) });
        for (const oldBlock of oldBlocks) {
          const carrier = oldBlock.component_type;
          const collection = COMPONENT_COLLECTION_BY_CARRIER[carrier];
          const componentValue = oldBlock[carrier];
          const componentId = typeof componentValue === 'object' ? componentValue?.id : componentValue;
          if (collection && componentId) {
            await api('DELETE', `/items/${collection}/${componentId}`);
          }
        }
      }
      const oldSections = await apiList(
        `/items/weo_page_sections?filter[page][_eq]=${pageId}&limit=-1&fields=id`);
      if (oldSections.length) {
        await api('DELETE', `/items/weo_page_sections`, { keys: oldSections.map((s) => s.id) });
      }
      await api('PATCH', `/items/weo_pages/${pageId}`, pagePayload);
      tally('pages', 'updated');
    } else {
      pageId = (await api('POST', '/items/weo_pages', pagePayload)).data.id;
      pageIdByPath.set(page.legacy_path, pageId);
      tally('pages', 'created');
    }
    for (const block of page.blocks) {
      const { collection, carrier, payload } = componentPayload(block);
      // Attach managed image file when the block references one.
      const imagePath = block.component.image;
      if (imagePath && typeof imagePath === 'string') {
        const key = imagePath.split('/').pop();
        const fileId = assetFileByKey.get(key);
        if (fileId && (carrier === 'hero' || carrier === 'text_media')) payload.image = fileId;
      }
      const component = (await api('POST', `/items/${collection}`, payload)).data;
      tally('components', 'created');
      await api('POST', '/items/weo_page_blocks', {
        status: 'published',
        page: pageId,
        sort: block.sort,
        component_type: carrier,
        [carrier]: component.id,
      });
      tally('page_blocks', 'created');
      await api('POST', '/items/weo_page_sections', {
        page: pageId,
        source_key: block.id,
        sort: block.sort,
        section_type: block.type,
        heading: block.component.heading ?? null,
        body_html: block.html,
        source_html: block.html,
        image_path: block.component.image ?? null,
        image_alt: block.component.image_alt ?? null,
        embed_url: block.component.embed_url ?? null,
        cta_label: block.component.primary_label ?? block.component.primary_cta_label ?? null,
        cta_url: block.component.primary_url ?? block.component.primary_cta_url ?? null,
        css_class: `article-${block.article_id}`,
        form_config: { provenance: block.provenance },
        status: 'published',
      });
      tally('page_sections', 'created');
    }

    // Draft form definitions (never wired to a live provider here).
    for (const block of page.blocks.filter((b) => b.type === 'form')) {
      await api('POST', '/items/weo_forms', {
        site: siteId,
        name: `${block.component.name} (${page.legacy_path})`,
        provider: block.component.provider ?? 'legacy-efi',
        external_id: block.component.external_id ?? null,
        status: 'draft',
      });
      tally('forms', 'created');
    }
  }

  // 5. Navigation items (re-created deterministically).
  const oldNav = await apiList(
    `/items/weo_navigation_items?filter[site][_eq]=${siteId}&limit=-1&fields=id`);
  if (oldNav.length) await api('DELETE', '/items/weo_navigation_items', { keys: oldNav.map((n) => n.id) });
  for (const [index, item] of site.navigation.entries()) {
    await api('POST', '/items/weo_navigation_items', {
      site: siteId,
      source_key: item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `nav-${index + 1}`,
      sort: index + 1,
      label: item.label,
      href: item.href,
      open_in_new_tab: item.target === '_blank',
      status: 'published',
    });
    tally('navigation_items', 'created');
  }

  // 6. Internal link graph extracted from governed block HTML.
  const oldLinks = await apiList(
    `/items/weo_internal_links?filter[site][_eq]=${siteId}&limit=-1&fields=id`);
  if (oldLinks.length) await api('DELETE', '/items/weo_internal_links', { keys: oldLinks.map((l) => l.id) });
  const anchorRe = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const page of pages) {
    const seen = new Set();
    for (const block of page.blocks) {
      for (const match of block.html.matchAll(anchorRe)) {
        const href = match[1];
        const label = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const key = `${href}${label}`;
        if (!href || seen.has(key)) continue;
        seen.add(key);
        await api('POST', '/items/weo_internal_links', {
          site: siteId,
          source_page: pageIdByPath.get(page.legacy_path),
          destination: href,
          anchor_text: label,
          is_internal: href.startsWith('/'),
        });
        tally('internal_links', 'created');
      }
    }
  }

  // 7. Immutable migration run receipt.
  await api('POST', '/items/weo_migration_runs', {
    site: siteId,
    run_key: `kimi-k3-${new Date().toISOString()}`,
    status: 'completed',
    orchestrator_version: 'kimi-extract-1.0.0',
    source_snapshot_sha256: sha256(readFileSync(join(FROZEN, 'pages.json'))),
    summary: {
      routes: pages.length,
      blocks: pages.reduce((n, p) => n + p.blocks.length, 0),
      dry_run: DRY_RUN,
      tallies: state,
    },
    created_at: new Date().toISOString(),
  });
  tally('migration_runs', 'created');

  console.log(JSON.stringify({ ok: true, dry_run: DRY_RUN, tallies: state }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error), tallies: state }, null, 2));
  process.exit(1);
});
