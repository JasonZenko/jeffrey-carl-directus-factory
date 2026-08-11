#!/usr/bin/env python3
"""Compare the fresh source freeze with the historical July evidence packet."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "source-freeze"
HISTORICAL = Path("/Users/jasonsibley/vault/20-Accounts/Clients/Marketly/jobs/jeffrey-carl-dmd/asp-to-astro-sanity-migration")
OUT = ROOT / "auditor" / "source-freeze-diff.json"

old_pages = json.loads((HISTORICAL / "manifests/pages.json").read_text())
new_pages = json.loads((CURRENT / "manifests/pages.json").read_text())
old_assets = json.loads((HISTORICAL / "manifests/assets.json").read_text())
new_assets = json.loads((CURRENT / "manifests/assets.json").read_text())

old_page_map = {item["sitemapUrl"].replace("https://jeffreycarldmd.com", "https://www.jeffreycarldmd.com"): item for item in old_pages}
new_page_map = {item["sitemapUrl"]: item for item in new_pages}
old_asset_map = {item["url"].replace("https://jeffreycarldmd.com", "https://www.jeffreycarldmd.com"): item for item in old_assets}
new_asset_map = {item["url"]: item for item in new_assets}

payload = {
    "historical_capture": str(HISTORICAL),
    "fresh_capture": "source-freeze",
    "pages": {
        "historical": len(old_pages),
        "fresh": len(new_pages),
        "added": sorted(set(new_page_map) - set(old_page_map)),
        "removed": sorted(set(old_page_map) - set(new_page_map)),
        "changed": sorted(url for url in set(old_page_map) & set(new_page_map) if old_page_map[url]["sha256"] != new_page_map[url]["sha256"]),
    },
    "assets": {
        "historical": len(old_assets),
        "fresh": len(new_assets),
        "added": sorted(set(new_asset_map) - set(old_asset_map)),
        "removed": sorted(set(old_asset_map) - set(new_asset_map)),
        "changed": sorted(url for url in set(old_asset_map) & set(new_asset_map) if old_asset_map[url]["sha256"] != new_asset_map[url]["sha256"]),
    },
}
OUT.write_text(json.dumps(payload, indent=2) + "\n")
print(json.dumps({
    "pages": {key: len(value) if isinstance(value, list) else value for key, value in payload["pages"].items()},
    "assets": {key: len(value) if isinstance(value, list) else value for key, value in payload["assets"].items()},
}, indent=2))
