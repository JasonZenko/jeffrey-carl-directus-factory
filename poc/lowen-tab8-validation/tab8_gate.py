#!/usr/bin/env python3
"""Read-only deterministic assertions for Dom's Lowen Tab 8 feedback."""
import argparse, hashlib, json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def result(check_id, ok, detail): return {"id": check_id, "ok": bool(ok), "detail": detail}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--migration", default=str(ROOT / "poc/lowen-baseline-a/migration/pages.json"))
    ap.add_argument("--fixture", default=str(Path(__file__).with_name("defects.json")))
    ap.add_argument("--output")
    ap.add_argument("--fixture-only", action="store_true")
    ap.add_argument("--diagnostic", action="store_true", help="write failures but exit zero")
    args = ap.parse_args()
    fixture, migration = Path(args.fixture), Path(args.migration)
    spec = json.loads(fixture.read_text())
    defects = spec.get("defects", [])
    required = {"id","category","title","target","owner","expected","automated_gate","status"}
    ids = [d.get("id") for d in defects]
    checks = [result("fixture", bool(defects) and len(ids)==len(set(ids)) and all(required <= set(d) for d in defects), "unique, complete defect records")]
    if not args.fixture_only:
        pages = json.loads(migration.read_text())
        by_slug = {p["slug"]: p for p in pages}
        p = by_slug["what-is-a-periodontist"]; types=[b["type"] for b in p["blocks"]]
        hero=p["blocks"][0]["item"]; joined=" ".join(str(b.get("item",{}).get("body_content","")) for b in p["blocks"])
        headings=" ".join(str(b.get("item",{}).get("section_header","")) for b in p["blocks"])
        checks += [result("T8-03", types==["inner_hero_standard","flex_content_section"] and bool(hero.get("intro_paragraph")) and "Periodontists Save Teeth" not in headings and "Medical Correlation" in joined and "cta_section_standard" not in types, f"types={types}; intro={bool(hero.get('intro_paragraph'))}")]
        p=by_slug["periodontal-disease-management"]; types=[b["type"] for b in p["blocks"]]
        checks += [result("T8-04", types and types[0]=="inner_hero_standard" and types.count("inner_hero_standard")==1, f"hero_count={types.count('inner_hero_standard')}; first={types[0] if types else None}")]
        p=by_slug["contact-us"]; types=[b["type"] for b in p["blocks"]]
        checks += [result("T8-06", types.count("contact_info_standard")==1, f"types={types}")]
        p=by_slug["our-services"]; highlights=[b for b in p["blocks"] if b["type"]=="highlight_links"]
        empty_heading=[b for b in p["blocks"] if b["type"]=="flex_content_section" and b.get("item",{}).get("section_header") and not str(b.get("item",{}).get("body_content","")).replace("<p>","").replace("</p>","").strip()]
        ok=len(highlights)==1 and bool(highlights[0].get("item",{}).get("section_heading")) and not empty_heading
        checks += [result("T8-07", ok, f"highlight_count={len(highlights)}; separate_empty_heading={len(empty_heading)}")]
    receipt={"schema_version":"1.0.0","generated_at":datetime.now(timezone.utc).isoformat(),"read_only":True,"fixture":{"path":str(fixture),"sha256":digest(fixture)},"migration":None if args.fixture_only else {"path":str(migration),"sha256":digest(migration)},"ok":all(c["ok"] for c in checks),"checks":checks,"failed_ids":[c["id"] for c in checks if not c["ok"]]}
    rendered=json.dumps(receipt,indent=2)
    if args.output: Path(args.output).write_text(rendered+"\n")
    print(rendered)
    raise SystemExit(0 if receipt["ok"] or args.diagnostic else 1)

if __name__ == "__main__": main()
