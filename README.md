# Jeffrey Carl DMD — clean Directus factory (Kimi K3 migration)

A noindex Astro + Directus review implementation of all 78 frozen routes from
`https://jeffreycarldmd.com/`, built extractively from `source-freeze/` under
`FACTORY-CONTRACT.md`. The live source site, DNS, forms, analytics and
indexing are untouched.

## Review surfaces

- Noindex site: https://jeffrey-carl-review.pages.dev/
- Public repository: https://github.com/JasonZenko/jeffrey-carl-directus-factory
- Directus: https://weomcms.foundryworks.ai/admin/ (`jeffrey-carl-dmd`)
- Green build/audit CI: https://github.com/JasonZenko/jeffrey-carl-directus-factory/actions/runs/31496886525
- Green Git-triggered preview deployment: https://github.com/JasonZenko/jeffrey-carl-directus-factory/actions/runs/31496886567

The original 18/18 browser matrix proved technical rendering only; it did not
prove visual fidelity and was correctly rejected during human review. The
replacement gate compares all six frozen page-family baselines at desktop,
tablet and mobile, preserves the source video/icon composition, and rejects
the former generic redesign. Current acceptance requires all three receipts:
78/78 exact-content routes, 18/18 technical browser checks and 18/18 visual
fidelity checks. The CMS contains 78 pages and 508 ordered native blocks with
zero orphan components.

## Layout

- `source-freeze/` — immutable capture (78 pages, 101 assets) and manifests. Input only.
- `auditor/` — independent, immutable acceptance criteria. Not owned by the migration agent.
- `scripts/extract.py` — deterministic extractor: frozen source → typed content records.
- `scripts/serve.mjs` — static review server preserving legacy `.asp` paths (port 4321).
- `scripts/directus_import.mjs` — provisions the clean WEO master (site, pages, blocks, assets).
- `scripts/build_receipt.mjs` — machine-readable build receipt.
- `site/` — Astro project: fail-closed Directus adapter, frozen reproducibility mode, six family templates, block modules.
- `receipts/` — extraction and build receipts (machine-readable).
- `.github/workflows/` — build/test/audit CI and credentialed noindex Cloudflare preview.

## Content model

Every page is decomposed into ordered, typed blocks (`hero`, `text_media`,
`cta`, `embed`, `form` are exercised by this content; the remaining palette
modules ship for template completeness). Each block carries:

- `html` — the governed, source-derived fragment (assets rewritten to managed
  paths, internal links to path-only, forms neutered)
- `component` — structured fields mirroring the native Directus component record
- `provenance` — source URL, source page sha256, article band id, fragment sha256

Ordinary flow content stays in governed rich text; structured blocks are used
only where the source pattern is unambiguous. No whole-page HTML/JSON blobs.
Every source article band renders as `<article data-source-article="ArtIDn">`
inside `<main data-fidelity-root>`; header/nav/footer stay outside.

## Commands

```sh
python3 scripts/extract.py            # deterministic extraction + offline contract reconciliation
cd site && npm ci && npm run build    # static build of all 78 routes
npm test                              # 22 contract/route/provenance/noindex/build tests
node scripts/serve.mjs                # serve dist at http://127.0.0.1:4321
node scripts/build_receipt.mjs        # receipts/build-receipt.json
python3 auditor/audit_rendered.py --target http://127.0.0.1:4321 --strict
python3 qa/browser_matrix.py --target http://127.0.0.1:4321
python3 qa/visual_fidelity.py --target http://127.0.0.1:4321
```

## Directus

The build adapter (`site/src/lib/directus.ts`) reads published content from
the clean WEO master with a server-only token. When the token is configured,
any CMS read or mapping error fails the build: a connected release can never
silently substitute stale content. Without a token, the repository remains
fully reproducible from the committed frozen records
(`site/src/content/frozen/`) using the same typed contracts.

Import (idempotent, dry-run supported):

```sh
DIRECTUS_SERVER_TOKEN=... node scripts/directus_import.mjs --dry-run
DIRECTUS_SERVER_TOKEN=... node scripts/directus_import.mjs
```

The completed Directus import contains 78 pages, 508 ordered native blocks,
101 managed assets, six pinned templates and per-block provenance. See
`docs/OPERATOR.md` for the full runbook, preview deployment and release gate.
