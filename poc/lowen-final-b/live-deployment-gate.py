#!/usr/bin/env python3
"""Prove the published Final B alias, immutable deployment and frozen assets."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


HERE = Path(__file__).resolve().parent
RECEIPTS = HERE / "receipts"


def fetch(url: str, method: str = "GET"):
    request = Request(url, method=method, headers={"User-Agent": "lowen-final-b-gate/1.0"})
    with urlopen(request, timeout=30) as response:
        return response.status, dict(response.headers.items()), response.read()


def verify_root(target: str):
    status, headers, payload = fetch(target.rstrip("/") + "/")
    html = payload.decode("utf-8")
    normalized_headers = {key.lower(): value.lower() for key, value in headers.items()}
    return {
        "url": target.rstrip("/") + "/",
        "status": status,
        "home_route_identity": 'data-page-slug="home"' in html,
        "html_noindex": "noindex, nofollow" in html,
        "header_noindex": "noindex, nofollow" in normalized_headers.get("x-robots-tag", ""),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--deployment-id", required=True)
    parser.add_argument("--deployment-url", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--expected-source", required=True)
    args = parser.parse_args()

    static_receipt = json.loads((RECEIPTS / "static-source-assets.json").read_text())
    route_receipt = json.loads((RECEIPTS / "route-matrix-live.json").read_text())
    if not route_receipt.get("ok") or route_receipt.get("passed") != 234 or route_receipt.get("failed") != 0:
        raise SystemExit("The complete 234-check live route receipt is not green")
    if route_receipt.get("target") != args.target.rstrip("/"):
        raise SystemExit("The route receipt target does not match the deployment alias")

    roots = [verify_root(args.target), verify_root(args.deployment_url)]
    source_matches = args.expected_source.startswith(args.source)
    route_paths = sorted({(urlparse(item["url"]).path or "/").rstrip("/") + "/" for item in route_receipt["results"]})
    route_parity = []
    for path in route_paths:
        alias_status, _, alias_payload = fetch(args.target.rstrip("/") + path)
        deployment_status, _, deployment_payload = fetch(args.deployment_url.rstrip("/") + path)
        alias_sha = hashlib.sha256(alias_payload).hexdigest()
        deployment_sha = hashlib.sha256(deployment_payload).hexdigest()
        route_parity.append({
            "path": path,
            "alias_status": alias_status,
            "deployment_status": deployment_status,
            "alias_sha256": alias_sha,
            "deployment_sha256": deployment_sha,
            "match": alias_sha == deployment_sha,
        })
    assets = []
    for item in static_receipt["files"]:
        checks = []
        for target in (args.target, args.deployment_url):
            url = target.rstrip("/") + item["route"]
            status, _, payload = fetch(url)
            digest = hashlib.sha256(payload).hexdigest()
            checks.append({"url": url, "status": status, "sha256": digest, "match": digest == item["sha256"]})
        assets.append({"route": item["route"], "expected_sha256": item["sha256"], "checks": checks})

    ok = (
        source_matches
        and all(all(value for key, value in root.items() if key not in {"url", "status", "sha256"}) and root["status"] == 200 for root in roots)
        and roots[0]["sha256"] == roots[1]["sha256"]
        and len(route_parity) == 78
        and all(item["alias_status"] == 200 and item["deployment_status"] == 200 and item["match"] for item in route_parity)
        and all(check["status"] == 200 and check["match"] for asset in assets for check in asset["checks"])
    )
    receipt = {
        "ok": ok,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "baseline": "Final B",
        "deployment_id": args.deployment_id,
        "deployment_url": args.deployment_url.rstrip("/"),
        "production_alias": args.target.rstrip("/"),
        "source": args.source,
        "expected_source": args.expected_source,
        "source_matches": source_matches,
        "live_route_matrix": {"passed": route_receipt["passed"], "failed": route_receipt["failed"]},
        "roots": roots,
        "route_parity": route_parity,
        "static_assets": assets,
    }
    (RECEIPTS / "live-deployment.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({
        "ok": ok,
        "deployment_id": args.deployment_id,
        "live_route_checks": route_receipt["passed"],
        "alias_to_immutable_routes": len(route_parity),
        "static_assets": len(assets),
        "isolated_roots": len(roots),
    }, indent=2))
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
