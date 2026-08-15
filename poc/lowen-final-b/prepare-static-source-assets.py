#!/usr/bin/env python3
"""Copy frozen non-image source downloads into the isolated static build."""

import hashlib
import json
import shutil
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
FREEZE = HERE.parent / "lowen-baseline-a/source-freeze"
PUBLIC = HERE.parents[1] / "site/public/lowen-assets"
RECEIPT = HERE / "receipts/static-source-assets.json"

manifest = json.loads((FREEZE / "manifests/assets.json").read_text())
assets = [item for item in manifest if item.get("contentType") == "application/pdf"]
PUBLIC.mkdir(parents=True, exist_ok=True)
copied = []
for item in assets:
    source = FREEZE / item["localPath"]
    target = PUBLIC / f"{item['sha256'][:12]}-{Path(urlparse(item['url']).path).name}"
    if hashlib.sha256(source.read_bytes()).hexdigest() != item["sha256"]:
        raise SystemExit(f"Frozen asset hash mismatch: {item['url']}")
    shutil.copyfile(source, target)
    copied.append({"source_url": item["url"], "route": f"/lowen-assets/{target.name}", "sha256": item["sha256"], "bytes": target.stat().st_size})

receipt = {"ok": len(copied) == len(assets), "assets": len(copied), "files": copied}
RECEIPT.parent.mkdir(parents=True, exist_ok=True)
RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
