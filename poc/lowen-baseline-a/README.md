# Lowen Perio Pearl Baseline A

This is the corrected Pearl-template migration benchmark.

- Source: `https://www.lowenperio.com/`
- Source family: WEO Pearl (`TPBand`, `TPcta`, `TPquote`, `webpage.css`)
- Review: noindex only
- Golden Pearl and Carolina negative-control estates remain untouched

The migration is two-stage:

1. `source-freeze/scripts/capture.py` captures the immutable source estate.
2. `scripts/object-map.py` builds each page from ordered source objects and maps those objects onto the approved 14-block Pearl contract.
3. `scripts/import-to-directus.mjs` imports the generated page, navigation, theme and block records without inventing a fixed homepage sequence.

`AGENTS.md` is repository policy, not migration logic. The main review surfaces are:

- `scripts/object-map.py`: source segmentation and object-to-Pearl mapping
- `scripts/import-to-directus.mjs`: idempotent Directus import
- `../../site/src/lib/pearl/directus.ts`: connected CMS loader
- `../../site/src/components/pearl/blocks/BlockRenderer.astro`: official renderer routing
- `../../../pearl-cms/schema/block-library.json`: approved Directus field contract

The acceptance rule is deliberate: Pearl controls the design grammar; source evidence controls navigation, branding values, page count, page hierarchy, block types, block order and block content.
