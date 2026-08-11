# Operator runbook

## 1. Reproduce the content records

```sh
python3 scripts/extract.py
```

Deterministic: re-running against the same `source-freeze/` produces
byte-identical `site/src/content/frozen/*.json` and `site/public/assets/*`
(CI enforces this with `git diff --exit-code`). The extractor also reconciles
its output offline against `auditor/source-contract.json` and exits non-zero
on any mismatch; details land in `receipts/extraction-mismatches.json`.

Extraction rules worth knowing:

- Images without frozen asset evidence (the broken `src="Logo URL"` schema
  placeholder, 21 occurrences) are dropped; every managed image is verified by
  SHA-256 against the frozen bytes.
- Internal links are rewritten to path-only; `tel:`/`mailto:`/external links
  are preserved as normalized absolute URLs.
- The one legacy form (Request Appointment) is neutered: `action=""`,
  `onsubmit="return false"`, original action kept in `data-source-action`.
  The review surface can never send a submission.

## 2. Build and verify locally

```sh
cd site && npm ci && npm run build && npm test
node scripts/serve.mjs &                      # http://127.0.0.1:4321
node scripts/build_receipt.mjs
python3 auditor/audit_rendered.py --target http://127.0.0.1:4321 --strict
python3 qa/browser_matrix.py --target http://127.0.0.1:4321
python3 qa/visual_fidelity.py --target http://127.0.0.1:4321
```

Expected: 78/78 route receipts green, 29/29 tests passing, 18/18 technical
browser checks and 18/18 visual-fidelity checks across six page families at
desktop, tablet and mobile.

The auditor compares rendered routes against the frozen evidence: exact
ordered copy, heading levels/text, links, image alt + byte hashes, embeds and
metadata. Failed routes produce structured findings in
`auditor/fidelity-results.json` — repair the implementation, never the
auditor, then rerun.

## 3. Directus import

Prerequisites: a server-only static token on the clean WEO master
(`https://weomcms.foundryworks.ai`) with write access to the `weo_*`
collections. The six global page templates (`homepage`, `service-treatment`,
`about-team`, `resource-article`, `contact-conversion`, `location-practice`)
must already exist; the import looks them up by slug and refuses to create or
modify global template definitions.

```sh
export DIRECTUS_SERVER_TOKEN=...        # never commit this
export DIRECTUS_ADMIN_PASSWORD=...      # only for schema/presentation repair
node scripts/repair_directus_authoring.mjs          # dry-run
node scripts/repair_directus_authoring.mjs --apply  # native Builder + editor organisation
node scripts/directus_import.mjs --dry-run   # validate the plan
node scripts/directus_import.mjs             # execute
DIRECTUS_BUILD_TOKEN="$DIRECTUS_SERVER_TOKEN" node scripts/verify_directus_authoring.mjs
```

Creates/updates: one `weo_sites` record (indexing disabled), managed assets
(`directus_files` + `weo_media_assets` with sha256), 78 `weo_pages` with
template FK, native component records with ordered `weo_page_builder` M2A
relationships, rollback-only `weo_page_blocks` relationships, mirrored `weo_page_sections` rows carrying per-block
provenance, navigation items, the internal link graph, one draft `weo_forms`
record (legacy provider; stays draft until an approved embed URL exists), and
a `weo_migration_runs` receipt.

The importer uses all semantic component collections directly. Ordinary copy
uses the Text + Media rich-text body. Feature grids, testimonials and team
grids create ordered second-level child records. Embeds and form sections use
their own component collections. The immutable `source_html` field is hidden
provenance used to preserve exact legacy presentation; it is not the editor's
primary content field. The connected adapter binds Feature Item, Testimonial
Item and Team Member authoring values into that preserved presentation. The
unit suite proves those second-level fields affect rendered HTML and leaves
already-synchronised source markup byte-for-byte unchanged.

The authoring verifier blocks handoff unless the live site contains exactly 78
pages, 508 native Builder rows, the expected semantic component distribution,
168 feature items, 21 testimonial items and 42 team members. It also checks
that the restricted build policy resolves the polymorphic and nested records.

## 4. Connected vs disconnected builds

- Disconnected reproducibility mode: without a token the build reads
  `site/src/content/frozen/`.
- Connected: set `DIRECTUS_URL` and `DIRECTUS_SERVER_TOKEN` (server-only, no
  `PUBLIC_` prefix; build-time only). The adapter in `site/src/lib/directus.ts`
  maps native page/template/Builder relationships into the identical typed
  contracts. Once configured, any fetch or mapping failure stops the build;
  there is no stale-content fallback in the connected release lane.

## 5. Preview deployment

`.github/workflows/deploy-preview.yml` deploys `site/dist` to Cloudflare
Pages (`jeffrey-carl-review` project) after a green strict audit. Required
secrets (referenced, never committed): `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`; and `DIRECTUS_SERVER_TOKEN` for connected builds.

Noindex controls ship in three layers and are all verified:
`site/public/_headers` (`X-Robots-Tag: noindex, nofollow`),
`<meta name="robots" content="noindex, nofollow">` on every page, and a
blocking `robots.txt` (`Disallow: /`). `scripts/serve.mjs` also sets the
header for local/CI audits.

## 6. Release gate (from FACTORY-CONTRACT.md)

- Git-triggered credentialed build: `.github/workflows/build-test.yml`.
- All 78 route receipts green (strict auditor run in CI).
- Noindex headers, meta robots and blocking robots.txt: shipped and tested.
- The automated browser matrix checks all six families at 1440, 768 and 390px
  for overflow, loaded images, console/page errors, noindex, source navigation,
  inert forms and axe-core WCAG 2.2 AA findings.
- The separate visual-fidelity matrix compares the rendered opening viewport
  with the 18 frozen screenshots using perceptual shape and colour thresholds,
  checks whole-page length proportion, and asserts the source-backed video,
  four-icon geometry and home-like location template. Technical cleanliness is
  not accepted as visual proof.
- A real Directus marker edit was built, blocked by the independent auditor,
  reverted in Directus and rebuilt to 78/78 green. See
  `receipts/directus-roundtrip.json`.
- Separate live Feature Item, Testimonial Item and Team Member edits were built,
  observed on the homepage, reverted and rebuilt clean without deployment. See
  `receipts/directus-nested-roundtrip.json`.
- Explicit approval remains required for production, DNS or indexing. Do not
  flip `indexing_enabled`, point DNS, or publish forms without it.
