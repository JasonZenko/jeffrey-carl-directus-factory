#!/usr/bin/env python3
"""Dependency-free cross-field validator for the director comparison receipt."""
import argparse, json, re
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("receipt"); args=ap.parse_args()
    data=json.loads(Path(args.receipt).read_text()); errors=[]
    sha=data.get("source_freeze_sha256","")
    if not re.fullmatch(r"[a-f0-9]{64}",sha): errors.append("invalid source freeze SHA-256")
    if data.get("production_mutated") is not False: errors.append("production_mutated must be false")
    arms=data.get("arms",[])
    if {a.get("mode") for a in arms}!={"normal","utility"}: errors.append("arms must be exactly normal and utility")
    if any(a.get("source_freeze_sha256")!=sha for a in arms): errors.append("both arms must use the identical frozen source")
    if len({a.get("page_count") for a in arms})!=1: errors.append("both arms must cover the same page count")
    for a in arms:
        for key in ("page_count","content_checks_passed","content_checks_total","visual_sample_pages","human_correction_minutes"):
            if not isinstance(a.get(key),(int,float)) or a[key] < 0: errors.append(f"{a.get('mode')} invalid {key}")
        if a.get("content_checks_passed",0)>a.get("content_checks_total",0): errors.append(f"{a.get('mode')} passed exceeds total")
    j=data.get("jeffrey_regression",{})
    for passed,total,minimum in (("strict_passed","strict_total",78),("browser_passed","browser_total",18),("visual_passed","visual_total",18)):
        if j.get(passed)!=j.get(total) or j.get(total,0)<minimum: errors.append(f"Jeffrey {passed} incomplete")
    if not data.get("recommendation"): errors.append("recommendation required")
    print(json.dumps({"ok":not errors,"errors":errors},indent=2)); raise SystemExit(bool(errors))

if __name__=="__main__": main()
