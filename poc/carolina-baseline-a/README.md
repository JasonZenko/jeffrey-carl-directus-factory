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

## Gaps found before Dom's component pass

1. Nitro Cache stores real media in `nitro-lazy-src`, `nitro-lazy-srcset` and `nitro-lazy-bg`. The extractor now resolves these attributes rather than accepting placeholder pixels.
2. Twenty source pages reference the same GoHighLevel appointment iframe. Baseline A records this as a provider-component exception instead of embedding arbitrary third-party markup into structured rich text. A governed appointment component and production routing test belong in phase two.
3. The source references one missing loader GIF from its own CSS. The 404 is recorded as non-material and is not silently replaced.

## Baseline B rule

Do not crawl Carolina Comfort again. Reuse this exact source freeze, rerun the normalizer and importer after Dom's component pass, then compare the two receipts. The source, URL inventory and acceptance scorecard stay fixed so only the component/mapping system changes.

Monday's promise is deliberately narrow: a fully functional POC demonstrating the core specification and automation potential. Wider provider coverage, exception handling, monitoring and batch rollout are production-hardening work for phase two.
