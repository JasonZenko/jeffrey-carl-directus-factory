# Jeffrey Carl clean migration factory contract

Benchmark start: 2026-08-11T11:41:17Z.

Source: https://jeffreycarldmd.com/

Target: a separate noindex Astro + Directus review implementation. The source website, DNS, forms, analytics and indexability are out of scope and must remain untouched.

## Separation of duties

- **Migration agent:** Kimi K3. It may extract, classify, map and implement content using the frozen source packet.
- **Fidelity auditor:** deterministic model-independent code owned outside the migration agent's pass. It compares the frozen evidence with the rendered output and produces route receipts.
- **Human QA:** begins only after the deterministic receipt is green.

Kimi must not declare its own route correct or weaken the auditor to make a result pass.

## Extractive-only content rule

- Preserve every source-backed word in order after cosmetic HTML normalization.
- Preserve heading levels and heading text.
- Preserve internal/external link labels, destinations and targets.
- Preserve each meaningful image exactly once unless the source genuinely repeats it.
- Preserve alt text and verify migrated image bytes by SHA-256.
- Preserve video/embed destinations.
- Preserve title, meta description, canonical evidence and structured data inputs.
- Do not invent, rewrite, summarize, expand or silently omit content.
- Do not add a CTA, eyebrow, heading, button or link unless source evidence supports it.

## Required Directus structure

Use the clean WEO master and its reusable templates:

- Homepage
- Service / Treatment
- About / Team
- Resource / Article
- Contact / Conversion
- Location / Practice

Use the smallest correct native block:

- Hero
- Text + Media
- Feature Grid
- Process
- FAQ
- CTA
- Testimonials
- Statistics
- Gallery
- Team Grid
- Form
- provider-safe Embed where source evidence requires it

Ordinary headings, paragraphs, lists and inline links remain together in governed rich text until the source introduces a genuinely different semantic or visual block. Whole-page HTML/JSON blobs are forbidden. Every block must retain source provenance.

## Route gate

Each of the 78 frozen routes must pass:

1. HTTP 200 at its preserved legacy path.
2. Exact ordered normalized copy.
3. Exact heading levels and text.
4. Exact meaningful links and destinations.
5. Exact image alt evidence and image byte hashes.
6. Exact embeds.
7. Exact metadata evidence.
8. Zero unsupported additions.
9. Valid Directus page, template and ordered block relationships.

Failed routes return to Kimi with structured findings. The independent auditor reruns after repair.

## Release gate

- Git-triggered credentialed build.
- All 78 route receipts green.
- Noindex headers, meta robots and blocking robots.txt.
- Desktop, tablet and mobile checks across all six families.
- Accessibility, keyboard, internal links, assets, forms-no-send safety, performance and edit-roundtrip checks.
- Machine-readable source, build, audit and timing receipts committed.
- Explicit approval remains required for production, DNS or indexing.
