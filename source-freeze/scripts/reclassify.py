#!/usr/bin/env python3
import csv
import json
from collections import Counter
from pathlib import Path
from bs4 import BeautifulSoup
from capture import ROOT, MANIFEST_DIR, template_family

pages_path = MANIFEST_DIR / "pages.json"
pages = json.loads(pages_path.read_text())
for page in pages:
    html = (ROOT / page["localPath"]).read_bytes()
    soup = BeautifulSoup(html, "html.parser")
    page["templateFamily"] = template_family(page["sitemapUrl"], page["title"], page["h1s"], soup)
pages_path.write_text(json.dumps(pages, indent=2))
(MANIFEST_DIR / "urls.json").write_text(json.dumps([
    {
        "sitemapUrl": p["sitemapUrl"], "finalUrl": p["finalUrl"], "status": p["status"],
        "canonical": p["canonical"], "templateFamily": p["templateFamily"],
        "localPath": p["localPath"],
    }
    for p in pages
], indent=2))

families = Counter(p["templateFamily"] for p in pages)
(MANIFEST_DIR / "proposed-page-types.json").write_text(json.dumps({
    "families": [{"family": k, "count": v} for k, v in sorted(families.items())],
    "models": {
        "home": "homePage", "about-team": "standardPage/personPage",
        "service-detail": "servicePage", "patient-resource": "patientResourcePage",
        "conversion": "conversionPage", "location": "locationPage",
    },
}, indent=2))

with (MANIFEST_DIR / "urls.csv").open("w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["sitemap_url", "final_url", "status", "canonical", "title", "h1_count", "template_family", "local_path"])
    for p in pages:
        w.writerow([p["sitemapUrl"], p["finalUrl"], p["status"], p["canonical"], p["title"], p["h1Count"], p["templateFamily"], p["localPath"]])

summary_path = MANIFEST_DIR / "capture-summary.json"
summary = json.loads(summary_path.read_text())
summary["templateFamilies"] = dict(families)
screenshots_path = MANIFEST_DIR / "screenshots.json"
if screenshots_path.exists():
    screenshots = json.loads(screenshots_path.read_text())
    summary["representativeScreenshots"] = sum(bool(s.get("localPath")) for s in screenshots)
    summary["screenshotFailures"] = sum(bool(s.get("error")) for s in screenshots)
    summary["screenshotHorizontalOverflow"] = sum(bool(s.get("horizontalOverflow")) for s in screenshots)
    summary["screenshotConsoleOrPageErrors"] = sum(len(s.get("errors", [])) for s in screenshots)
summary_path.write_text(json.dumps(summary, indent=2))
print(json.dumps(dict(families), indent=2))
