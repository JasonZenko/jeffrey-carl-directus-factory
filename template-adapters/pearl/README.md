# Pearl template adapter

This directory is the client-independent contract for the Pearl design template. Pearl content and authoring now live in the dedicated Directus instance at `https://pearlcms.foundryworks.ai/admin/`; Jeffrey Carl and the WEO component estate are deliberately excluded from that CMS.

Developer handoff: [`DEVELOPER-WORKFLOW.md`](DEVELOPER-WORKFLOW.md) explains the component rules, Directus-to-Astro data flow, local workflow, pull-request gates and noindex deployment path step by step.

## Version 1.0.0

The official block library from the approved migration specification contains:

- Inner Hero Standard
- Flex Content Section
- Highlight Links
- Image Gallery Grid
- Testimonial List Standard
- Main Hero Standard
- Icon Feature Cards
- Feature Image Content
- Highlight Snippet Quote
- CTA Section Standard
- Contact Info Standard
- Areas Served Links
- FAQ Dropdown
- Cherry Financing

The adapter also includes a singleton **Pearl Theme Library** in Directus. It governs heading and body families, H1/H2/H3/body weights, type scale, line height, the global palette, content width, section spacing and button radius. Font families and scale choices are bounded; colour fields remain editable but must pass the noindex preview's automated WCAG check before release.

The manifest owns four things together: the Directus collection/field contract, the Astro renderer name, deterministic source signals and the allowed page-family blueprints. Unknown or ambiguous source regions stop for manual review. They never silently become Rich Text.

## Working slice

- `/Users/jasonsibley/Code/pearl-cms/schema/block-library.json` is the official Directus contract and its provisioner is idempotent.
- `site/src/components/pearl/blocks/` contains fourteen independent CMS block renderers plus a single `BlockRenderer.astro` composition boundary.
- `pearl_theme_settings` is the global design-token authority. A published singleton record is required for connected builds and is rendered as validated CSS custom properties.
- Every renderer accepts the exact snake_case field names defined by its Directus collection. The locked field lists live in `site/src/components/pearl/types.ts` and are checked against this manifest in CI.
- Component-specific structure and CSS are colocated inside each `.astro` file. `site/src/styles/pearl.css` now contains only the shared reset, typography, tokens and workshop shell.
- Reusable primitives live in `site/src/components/pearl/ui/`; the template layout is isolated under `site/src/layouts/pearl/`; Directus collection bindings and design tokens live under `site/src/lib/pearl/`.
- `/template-preview/pearl/` renders the homepage workshop. Every approved published CMS page is also generated at `/template-preview/pearl/<slug>/`, always with `noindex, nofollow` and no production form actions.

Preview locally:

```bash
cd site
npm run build
npm run dev
# open http://localhost:4321/template-preview/pearl/
```

Inspect the Directus plan without changing a server:

```bash
node template-adapters/pearl/directus/provision-pearl-schema.mjs --json
```

## Activation sequence

1. Review the field names and editor ergonomics with Dom.
2. **Complete:** provision the dedicated Pearl Directus and exclude all WEO/Jeffrey collections and drafts.
3. Visually refine each working Astro renderer with Dom at desktop and mobile sizes.
4. Add positive, negative and collision mapping fixtures from the frozen Pearl source.
5. Prove Directus edits reach Astro and revert cleanly.
6. Pass source, frontend, authoring and field-authority gates.
7. Change `activation.active` only in a reviewed release commit.

The accepted Jeffrey Carl build remains unchanged while this adapter is developed on `pearl-template-v0.1`.

## Theme editing

In `https://pearlcms.foundryworks.ai/admin/`, open **Pearl Theme Library**. Change the global settings, keep the record published, then run the connected noindex review build. One setting updates every Pearl block and the shared header/footer. `qa/pearl_reference_qa.py` must pass at desktop, tablet and mobile before a theme change is approved.

## Page and component previews

- Open **Pages**, choose an approved published page, and use Directus Preview. The page slug is resolved to its own noindex Cloudflare route.
- Page composition may contain any ordered combination of the fourteen published Pearl Block Library types. The homepage must retain a leading Main Hero Standard and a Contact Info Standard block.
- A newly created component starts as **Draft**. Set that component to **Published** before promoting the page version; the connected build intentionally refuses to render an approved page that references a draft component.
- Theme hex values are normalized case-insensitively. Valid six-digit colours proceed to responsive WCAG QA; an inaccessible combination still blocks release.

Pearl-owned Directus assets are publicly readable through a title-prefix allowlist so static pages can render them. Everything else remains private; the clean CMS verifier proves both sides of that boundary.
