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

## Activation sequence

1. Review the field names and editor ergonomics with Dom.
2. Create the schema snapshot for the listed collections and relations.
3. Build each named Astro renderer against fixtures, including mobile and accessibility checks.
4. Add positive, negative and collision mapping fixtures from the frozen Pearl source.
5. Prove Directus edits reach Astro and revert cleanly.
6. Pass source, frontend, authoring and field-authority gates.
7. Change `activation.active` only in a reviewed release commit.

The accepted Jeffrey Carl build remains unchanged while this adapter is developed on `pearl-template-v0.1`.
