# Pearl template adapter

This directory is the clean, client-independent contract for the Pearl design template. It does not contain Jeffrey Carl client records and it is deliberately inactive until the Directus schema, Astro renderers, mapping fixtures and editor round-trip receipts are complete.

## Version 0.1.0

The first contract covers the reusable blocks identified in Dom's Tab 4 review:

- Main Hero
- Inner Hero + CTA
- Flex Content + Image
- Split Image Content
- Patient Reviews
- Areas Served Links
- Icon Circles
- Highlight Quote
- Content Image

`Content Image` makes imagery independently editable instead of burying it in a Rich Text field.

The manifest owns four things together: the Directus collection/field contract, the Astro renderer name, deterministic source signals and the allowed page-family blueprints. Unknown or ambiguous source regions stop for manual review. They never silently become Rich Text.

## Working slice

- `directus/pearl-schema.mjs` converts the manifest into an idempotent schema plan.
- `directus/provision-pearl-schema.mjs` is dry-run by default. `--apply` requires an HTTPS `DIRECTUS_URL` and a separate `DIRECTUS_ADMIN_TOKEN`.
- `site/src/components/pearl/` contains all nine working Astro renderers and source-backed fixtures.
- `/template-preview/pearl/` renders the complete component workshop with `noindex, nofollow` and no production form actions.

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
2. **Complete:** apply the generated schema plan to the shared WEO master as an inactive, empty Pearl namespace. See `receipts/directus-schema-apply-2026-08-12.json`.
3. Visually refine each working Astro renderer with Dom at desktop and mobile sizes.
4. Add positive, negative and collision mapping fixtures from the frozen Pearl source.
5. Prove Directus edits reach Astro and revert cleanly.
6. Pass source, frontend, authoring and field-authority gates.
7. Change `activation.active` only in a reviewed release commit.

The accepted Jeffrey Carl build remains unchanged while this adapter is developed on `pearl-template-v0.1`.
