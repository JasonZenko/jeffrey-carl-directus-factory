#!/usr/bin/env python3
"""Create a deterministic receipt for the isolated Beaverton source freeze."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FREEZE = ROOT / "source-freeze"
MANIFESTS = FREEZE / "manifests"

pages = json.loads((MANIFESTS / "pages.json").read_text())
assets = json.loads((MANIFESTS / "assets.json").read_text())
page_failures = json.loads((MANIFESTS / "page-failures.json").read_text())

local_hash_failures = []
for kind, records in (("page", pages), ("asset", assets)):
    for item in records:
        local_path = FREEZE / item["localPath"]
        actual = hashlib.sha256(local_path.read_bytes()).hexdigest() if local_path.exists() else None
        if actual != item["sha256"]:
            local_hash_failures.append({
                "kind": kind,
                "url": item.get("sitemapUrl", item.get("url")),
                "local_path": item["localPath"],
                "expected_sha256": item["sha256"],
                "actual_sha256": actual,
            })

source_lines = [f"page\t{item['sitemapUrl']}\t{item['sha256']}" for item in pages]
source_lines.extend(f"asset\t{item['url']}\t{item['sha256']}" for item in assets)
source_freeze_sha256 = hashlib.sha256(("\n".join(sorted(source_lines)) + "\n").encode()).hexdigest()

receipt = {
    "source": "https://beaverton-endodontist.com/",
    "sitemap_route_count": len(pages),
    "http_200_pages": sum(item["status"] == 200 for item in pages),
    "page_failure_count": len(page_failures),
    "asset_count": len(assets),
    "local_hash_failure_count": len(local_hash_failures),
    "all_local_hashes_verified": not local_hash_failures,
    "source_freeze_sha256": source_freeze_sha256,
    "comparison_contract": {
        "presentation_mode_source_freeze_sha256": source_freeze_sha256,
        "utility_mode_source_freeze_sha256": source_freeze_sha256,
        "identical_source_required": True,
    },
}

if local_hash_failures:
    raise RuntimeError(json.dumps(local_hash_failures, indent=2))

(ROOT / "source-freeze-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
