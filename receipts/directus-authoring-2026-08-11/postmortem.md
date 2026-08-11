# Directus authoring regression — repair receipt and postmortem

Date: 2026-08-11

Site: `jeffrey-carl-dmd`

Verdict: repaired; native authoring and frontend fidelity gates green

## What Don found

Don's report was accurate. The frontend was visually faithful, but the clean
Directus master had regressed as an editor experience:

- 455 of 508 page blocks were carried through Text + Media.
- The four homepage composites were all Text + Media records.
- Feature, testimonial and team child collections contained zero records.
- Pages exposed two legacy O2M editor paths rather than the previous native
  polymorphic Builder.
- All WEO collections were ungrouped, so technical and nested collections
  appeared beside normal editorial collections.

## Root cause

This was a migration-contract failure, not a Directus limitation.

1. The clean-master transfer copied the reusable collection schema and the
   frozen frontend content, but did not port the native M2A Builder and editor
   presentation layer from the previous iteration.
2. The extractor deliberately defaulted ambiguous source bands to Text +
   Media. It had no positive semantic recognisers for the repeated homepage
   and location composites.
3. The importer populated component parents but did not create nested feature,
   testimonial or team child records. Embed and form blocks were routed through
   Text + Media because their native collections were not wired into the page
   relationship.
4. Acceptance tested route content, noindex safety, browser behaviour and
   pixels. It did not assert CMS authoring semantics, nested records or editor
   organisation. The frontend could therefore pass while the backend
   regressed.

The process missed a fourth release dimension: **authoring fidelity**.

## Repair

- Added the native `weo_pages.content` M2A Page Content Builder.
- Hid rollback-only `content_sections` and `structured_blocks` editor paths.
- Added native Embed and Form Section component collections.
- Restricted rich text to the Text + Media `body_html` field.
- Added semantic extraction for feature grids, testimonials and team grids.
- Created ordered second-level child records for cards, quotes and people.
- Organised the sidebar into Website Content, Page Components and Operations &
  Evidence; hid child and technical collections from normal navigation.
- Updated the connected build adapter to read the native Builder.
- Bound feature-card, testimonial and team-member child fields back into the
  preserved source presentation, so nested edits change the connected build
  without sacrificing the frozen layout.
- Added offline semantic tests and a live blocking authoring verifier to both
  CI and preview-deploy workflows.
- Reconciled the restricted Directus build credential in Keychain and GitHub
  Actions after the stored local copy was found stale.

## Before and after

| Contract | Before | After |
|---|---:|---:|
| Native Builder rows | 0 | 508 |
| Text + Media blocks | 455 | 360 |
| Feature Grids | 0 | 42 |
| Testimonials groups | 0 | 21 |
| Team Grids | 0 | 21 |
| Native Embeds | 0 | 10 |
| Native Form Sections | 0 | 1 |
| Nested Feature Items | 0 | 168 |
| Nested Testimonial Items | 0 | 21 |
| Nested Team Members | 0 | 42 |

The remaining component distribution is 44 Heroes and 9 Calls to Action, for
508 total ordered page components across 78 pages.

## Acceptance evidence

- Live authoring verifier: 78 pages, 508 native Builder rows, exact semantic
  distribution, 168 feature items, 21 testimonial items and 42 team members.
- Restricted build token resolves every polymorphic parent and nested child.
- Directus-connected Astro build: 79 outputs generated successfully.
- Repository tests: 29/29 passed, including nested-field binding tests.
- Strict content audit: 78/78 routes passed.
- Browser matrix: 18/18 passed.
- Visual fidelity: 18/18 passed.
- Authenticated editor UI: Page Content visible; homepage contains two Feature
  Grids, Testimonials and Team Grid; legacy paths and orphan child collections
  absent.
- Live nested round trips: a Feature Item title, Testimonial Item quote and Team
  Member name were each temporarily edited in Directus, appeared in connected
  homepage builds, then were reverted and confirmed absent from the identical
  clean rebuild. No marker was deployed. See
  `../directus-nested-roundtrip.json`.
- Indexing remained disabled; every page remains noindex/nofollow.

Screenshot: `homepage-editor-final.png` (authenticated final editor state).

## Permanent prevention

No future Directus transfer is accepted on frontend evidence alone. The
factory contract now blocks release unless native Builder relationships,
semantic component distribution, nested child records, editor folders and the
restricted build-policy read all pass alongside content, browser and visual
fidelity. Nested records must also pass a field-to-render binding test; record
counts alone are not accepted as proof that the fields are authoritative.
