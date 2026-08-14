# Carolina Comfort Dental — Pearl Baseline A

This is the untouched-site reproducibility proof for the Monday 17 August 2026 Pearl POC.

- Source: `https://www.carolinacomfortdental.com/`
- Frozen sitemap: `https://www.carolinacomfortdental.com/sitemap.xml`
- Expected current URL count at selection: 26
- CMS: `https://pearl-poc-cms.foundryworks.ai/admin/`
- Review: `https://pearl-carolina-poc.pages.dev/`
- Golden Pearl CMS remains separate and unchanged.

Baseline A is captured and migrated before Dom's component pass. Baseline B must use this exact frozen source, not recrawl the live site, so component-system changes are the only independent variable.

The first extraction pass revealed that Nitro Cache keeps real media in non-standard `nitro-lazy-src`, `nitro-lazy-srcset` and `nitro-lazy-bg` attributes. Baseline A therefore adds these attributes to the deterministic media inventory instead of accepting placeholder SVG/GIF pixels as source images.

The homepage is frozen to the canonical seven-block sequence. Inner pages may use, duplicate and reorder any of the fourteen official Pearl blocks.

## Baseline A evidence

- Source freeze: 26/26 pages returned HTTP 200, 184 source assets were inventoried and 12 reference screenshots cover four page families across desktop, tablet and mobile.
- Migration: 26 published pages, 87 native Builder rows, 27 managed media uploads and the exact seven-block homepage were imported into the isolated CMS.
- Content reconciliation: median source-word coverage is 93.54%. The small thank-you page is the minimum outlier because it contains only 27 visible source words.
- Inner-page proof: About Our Office, Services, Root Canals and Contact Us render different official block combinations with zero horizontal overflow, broken images, console errors or first-party request failures.
- Infrastructure: the isolated stack has its own database, Redis, uploads, users, tokens, tunnel, port, backup timer and Cloudflare Pages project. A real database restore recovered all 37 custom collections, 26 pages and 87 Builder rows.
- CMS contract: 37 collections, 281 fields, 25 relations, 14 official blocks, 28 versioned authoring collections, three required Administrators, isolated build-reader permissions, dynamic page previews, Visual Editor and governed public assets all pass against the clean-room instance.
- Admin proof: authenticated Studio loaded the exact Carolina review, exposed nine editable overlays across the seven frozen homepage blocks, and opened the real Main Hero record drawer. A disposable page version was created and deleted with Main unchanged.
- Release proof: an approved Highlight Snippet Quote was added only to the Root Canals inner page, deployed in run `31812583060`, verified publicly, then deleted. Rollback run `31812889399` passed and restored the exact three original Builder rows. The homepage remained the same seven blocks throughout.

## Gaps found before Dom's component pass

1. Nitro Cache stores real media in `nitro-lazy-src`, `nitro-lazy-srcset` and `nitro-lazy-bg`. The extractor now resolves these attributes rather than accepting placeholder pixels.
2. Twenty source pages reference the same GoHighLevel appointment iframe. Baseline A records this as a provider-component exception instead of embedding arbitrary third-party markup into structured rich text. A governed appointment component and production routing test belong in phase two.
3. The source references one missing loader GIF from its own CSS. The 404 is recorded as non-material and is not silently replaced.
4. Visual Editing was initially bound to the golden Pearl CMS URL in frontend code. The renderer now takes the CMS URL from the connected build environment, so the clean-room Studio edits its own records rather than the golden instance.
5. Two release checks still assumed the entire migrated site was immutable: one required exactly 87 Builder rows and another required an exact Root Canals block list. The contract now preserves the 87-row baseline, rejects removals and unknown block types, freezes the homepage exactly, and permits reviewed growth on inner pages.

## Baseline B rule

Do not crawl Carolina Comfort again. Reuse this exact source freeze, rerun the normalizer and importer after Dom's component pass, then compare the two receipts. The source, URL inventory and acceptance scorecard stay fixed so only the component/mapping system changes.

Monday's promise is deliberately narrow: a fully functional POC demonstrating the core specification and automation potential. Wider provider coverage, exception handling, monitoring and batch rollout are production-hardening work for phase two.
