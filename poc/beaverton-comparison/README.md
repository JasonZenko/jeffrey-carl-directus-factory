# Beaverton presentation-versus-utility comparison

This is an isolated, read-only source freeze for `https://beaverton-endodontist.com/`.
It does not write to Directus, deploy a preview, or modify the live source, DNS,
forms, analytics or indexing.

## Frozen input

- Capture entry point: `source-freeze/scripts/capture.py`
- Engine: the repository's canonical `source-freeze/scripts/capture.py`
- Sitemap: `https://beaverton-endodontist.com/pages-sitemap.xml`
- Discovered routes: 28 at capture time
- Deterministic evidence: per-page and per-asset SHA-256 manifests plus
  `source-freeze-receipt.json`

Run the freeze and receipt from the repository root:

```bash
python3 poc/beaverton-comparison/source-freeze/scripts/capture.py
python3 poc/beaverton-comparison/verify_freeze.py
```

## Comparison contract

The presentation migration and utility migration must consume this identical
frozen input and record the exact same `source_freeze_sha256` from
`source-freeze-receipt.json`. A result using a fresh crawl, a different route
set or a different hash is not a valid comparison.

- Presentation mode may use the full Pearl block vocabulary where source
  evidence supports the classification.
- Utility mode keeps one Inner Hero per inner page and preserves remaining
  source content in ordered Flex Content blocks with minimal interpretation.
- Both modes must report content fidelity, route coverage, editor correction
  count/time and responsive visual results against the same 28-route freeze.

## Build and validate the isolated arms

```bash
python3 poc/beaverton-comparison/build_comparison.py
python3 poc/beaverton-comparison/validate_outputs.py
python3 poc/lowen-tab8-validation/validate_director_comparison.py \
  poc/beaverton-comparison/outputs/director-comparison.json
```

Outputs are JSON authoring models only. They are not a CMS import or deployed
frontend. The utility arm enforces one Inner Hero plus ordered Flex Content on
every inner page; the two homepage records receive a minimal `home_hero` map.
The presentation arm conservatively promotes only unambiguous contact, links,
and office-tour patterns. Visual comparison and human correction timing remain
explicitly unmeasured until a renderer/editor pass exists.
