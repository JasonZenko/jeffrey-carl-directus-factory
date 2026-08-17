#!/usr/bin/env python3
"""Validate isolated Beaverton arm invariants without rendering or deployment."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent; OUT=ROOT/"outputs"
receipt=json.loads((ROOT/"source-freeze-receipt.json").read_text()); expected=receipt["source_freeze_sha256"]
presentation=json.loads((OUT/"presentation-pages.json").read_text()); utility=json.loads((OUT/"utility-pages.json").read_text())
errors=[]
if len(presentation)!=28 or len(utility)!=28: errors.append("both arms must contain 28 routes")
if [p["source_url"] for p in presentation] != [p["source_url"] for p in utility]: errors.append("route order differs")
for arm_name,pages in (("presentation",presentation),("utility",utility)):
    for p in pages:
        if p["source_freeze_sha256"]!=expected: errors.append(f"{arm_name}:{p['slug']} freeze mismatch")
        if not p["blocks"]: errors.append(f"{arm_name}:{p['slug']} has no blocks")
for p in utility:
    types=[b["type"] for b in p["blocks"]]
    if p["family"]=="home":
        if not types or types[0]!="home_hero": errors.append(f"utility:{p['slug']} homepage is not minimally hero-mapped")
    elif not types or types[0]!="inner_hero_standard" or types.count("inner_hero_standard")!=1 or any(t not in {"inner_hero_standard","flex_content_section"} for t in types):
        errors.append(f"utility:{p['slug']} violates hero+flex-only rule")
comparison=json.loads((OUT/"director-comparison.json").read_text())
if comparison["source_freeze_sha256"]!=expected: errors.append("comparison freeze mismatch")
print(json.dumps({"ok":not errors,"route_count":len(utility),"presentation_blocks":sum(len(p['blocks']) for p in presentation),"utility_blocks":sum(len(p['blocks']) for p in utility),"errors":errors},indent=2))
raise SystemExit(bool(errors))
