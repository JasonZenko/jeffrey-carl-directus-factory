# Lowen Perio Pearl Baseline B

Status: `complete`

Baseline B used the exact frozen 39-page Lowen estate captured for Baseline A. It did not recrawl the source or substitute the live site. Foundry supplied the source-backed navigation/route wiring; Dom's broader Practice/Theme Settings work remains a parallel post-POC stream.

## Frozen inputs

- Page manifest: `../lowen-baseline-a/source-freeze/manifests/pages.json`
- Page-manifest SHA-256: `575a5f3592f897acd764ff38edee8257e4ca5de86ab8d8395298e97dd95d8d0e`
- Asset manifest: `../lowen-baseline-a/source-freeze/manifests/assets.json`
- Asset-manifest SHA-256: `2cb1431ca318ae3990e76643cf6cc7c24670756b5f1eee8557338a6db29b37a1`
- Canonical Pearl contract: `../lowen-baseline-a/contract/pearl-block-library.v1.json`
- Contract version: `1.1.0`
- Contract SHA-256: `b9873592aab684842ac4541f987def5df646e17365ad1b77231a19991da722c9`

## Baseline A comparison facts

- 39 source pages
- 88 mapped blocks before the Foundry contract/safety corrections
- 3 provider exceptions
- Homepage sequence ended with a forced `contact_info_standard` block
- Testimonials remained inside a legacy `flex_content_section`
- Responsive homepage QA: 3/3 viewports passed
- Representative inner-page QA: 4/4 pages passed

The completed Baseline B payload has 87 source-derived blocks, no forced homepage Contact Info block, one typed testimonial list, 87/87 automatic mappings at or above 0.90 confidence, and three explicitly queued provider exceptions.

## Start gates

1. Foundry's source-backed header route wiring consumes the six frozen Lowen navigation items.
2. Existing Lowen Practice/Theme values supply the minimum POC shell; complete settings plumbing is not a run blocker.
3. Footer map is confirmed across desktop, tablet and mobile.
4. Canonical 14-block parity tests pass with no field drift.
5. `node ../lowen-baseline-a/scripts/validate-release.mjs` passes.
6. The target remains noindex/nofollow and has a recoverable pre-import snapshot.

## Run protocol

1. Record the integration commit and start timestamp.
2. Verify all three frozen-input hashes above.
3. Run the mapper once against the frozen estate.
4. Run the release preflight. Do not import if it reports any error.
5. Dry-run the Directus import and save the receipt.
6. Apply the import only to the isolated Lowen review instance.
7. Build from connected Directus data.
8. Run every-route source/object-order checks, desktop/tablet/mobile browser QA, WCAG checks and noindex checks.
9. Record end timestamp, human interventions and every exception decision.
10. Complete `scorecard-template.json` and compare it with the Baseline A facts above.

## Completed result

- Import: 39/39 pages, 87 blocks, 47 managed assets and six ordered navigation items.
- Contract: Pearl 1.1.0, with Flex CTAs represented as adjacent ordered CTA blocks and testimonial stars treated as presentation rather than source evidence.
- Flex gate: 34/34 Flex blocks passed copy, heading, list, link, image, order and CTA-handoff validation; this frozen source contained no inline Flex CTA requiring a handoff.
- Connected contract suite: 50/50 tests passed.
- Hosted browser acceptance: 117/117 checks passed across all 39 routes at desktop, tablet and mobile, including exact object order, exact header navigation, mobile-menu behaviour, images, overflow, first-party runtime errors, one source H1, noindex and WCAG AA.
- Live noindex review: `https://pearl-lowen-poc.pages.dev/`
- Recoverability: pre-import database and upload backups are `pearl-lowen-poc-20260815T103846Z.dump` and `uploads-20260815T103846Z.tar.gz`; the pre-run environment is `.env.pre-baseline-b-20260815T1045Z`.
- Start: `2026-08-15T10:43:50.168Z`; completion: `2026-08-15T11:11:07.728573Z`.
