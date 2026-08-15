#!/usr/bin/env python3
"""Capture and measure frozen-source versus Final B clean routes at D/T/M."""

import argparse
import hashlib
import json
import mimetypes
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
BASELINE = HERE.parent / "lowen-baseline-a"
FREEZE = BASELINE / "source-freeze"
PAGES = json.loads((BASELINE / "migration/pages.json").read_text())
PAGE_MANIFEST = json.loads((FREEZE / "manifests/pages.json").read_text())
ASSET_MANIFEST = json.loads((FREEZE / "manifests/assets.json").read_text())
SOURCE_LEDGER = json.loads((HERE / "receipts/source-region-fidelity.json").read_text())
SOURCE_BY_HASH = {item["sha256"]: item for item in PAGE_MANIFEST}
LEDGER_BY_SLUG = {item["slug"]: item for item in SOURCE_LEDGER["pages"]}
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "tablet": {"width": 820, "height": 1080},
    "mobile": {"width": 390, "height": 844},
}


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def route_for(target: str, slug: str) -> str:
    return target if slug == "home" else f"{target}/{slug}/"


def clean_source_html(path: Path, source_url: str) -> str:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    for node in soup.select("script,noscript"):
        node.decompose()
    base = soup.new_tag("base", href=source_url)
    (soup.head or soup).insert(0, base)
    style = soup.new_tag("style")
    style.string = "*,*::before,*::after{animation:none!important;transition:none!important}.TPadaBtn{display:none!important}"
    (soup.head or soup).append(style)
    return str(soup)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    target = args.target.rstrip("/")
    visual = HERE / "visual"
    source_dir, target_dir = visual / "source", visual / "target"
    source_dir.mkdir(parents=True, exist_ok=True)
    target_dir.mkdir(parents=True, exist_ok=True)

    assets_by_path = {}
    for item in ASSET_MANIFEST:
        local = FREEZE / item["localPath"]
        if local.exists():
            assets_by_path[urlparse(item["url"]).path] = (local, item.get("contentType") or mimetypes.guess_type(local.name)[0] or "application/octet-stream")
            assets_by_path[urlparse(item.get("finalUrl") or item["url"]).path] = (local, item.get("contentType") or mimetypes.guess_type(local.name)[0] or "application/octet-stream")

    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for page_contract in PAGES:
            slug = page_contract["slug"]
            source = SOURCE_BY_HASH[page_contract["source_html_sha256"]]
            source_path = FREEZE / source["localPath"]
            source_html = clean_source_html(source_path, source["finalUrl"])
            expected_regions = len(LEDGER_BY_SLUG[slug]["source_regions"])
            expected_blocks = len(page_contract["blocks"])
            mapped_tokens = sum(LEDGER_BY_SLUG[slug]["copy"]["mapped_counter"].values())
            for viewport_name, viewport in VIEWPORTS.items():
                context = browser.new_context(viewport=viewport)

                def local_asset(route):
                    parsed = urlparse(route.request.url)
                    asset = assets_by_path.get(parsed.path)
                    if asset:
                        route.fulfill(path=str(asset[0]), content_type=asset[1])
                    else:
                        route.abort()

                source_page = context.new_page()
                source_page.route("**/*", local_asset)
                source_page.set_content(source_html, wait_until="load")
                source_page.wait_for_timeout(150)
                source_metrics = source_page.evaluate("""
                    () => ({
                      height: document.documentElement.scrollHeight,
                      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
                      regions: document.querySelectorAll('[id^="ArtID"]').length,
                    })
                """)
                source_shot = source_dir / f"{slug}--{viewport_name}.jpg"
                source_page.screenshot(path=str(source_shot), full_page=True, type="jpeg", quality=72)
                source_page.close()

                target_page = context.new_page()
                response = target_page.goto(route_for(target, slug), wait_until="networkidle")
                target_page.wait_for_timeout(100)
                target_metrics = target_page.evaluate("""
                    () => {
                      const blocks = [...document.querySelectorAll('[data-pearl-block]')];
                      const rects = blocks.map(node => {
                        const rect = node.getBoundingClientRect();
                        return {top: rect.top + scrollY, bottom: rect.bottom + scrollY};
                      });
                      const gaps = rects.slice(1).map((rect, index) => Math.max(0, Math.round(rect.top - rects[index].bottom)));
                      return {
                        height: document.documentElement.scrollHeight,
                        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
                        blocks: blocks.length,
                        maxBlockGap: Math.max(0, ...gaps),
                        pageSlug: document.body.dataset.pageSlug || '',
                      };
                    }
                """)
                target_shot = target_dir / f"{slug}--{viewport_name}.jpg"
                target_page.screenshot(path=str(target_shot), full_page=True, type="jpeg", quality=72)
                target_page.close()
                context.close()

                height_ratio = round(target_metrics["height"] / source_metrics["height"], 3) if source_metrics["height"] else None
                checks = {
                    "source_capture_hash_matches": hashlib.sha256(source_path.read_bytes()).hexdigest() == page_contract["source_html_sha256"],
                    "source_regions_present": source_metrics["regions"] == expected_regions,
                    "target_status_200": bool(response and response.status == 200),
                    "target_route_identity": target_metrics["pageSlug"] == slug,
                    "target_blocks_complete": target_metrics["blocks"] == expected_blocks,
                    "target_no_overflow": target_metrics["overflow"] <= 1,
                    "target_section_density_sane": target_metrics["maxBlockGap"] <= 16,
                    "page_density_ratio_sane": height_ratio is not None and 0.2 <= height_ratio <= 5.0,
                    "screenshots_nonempty": source_shot.stat().st_size > 1000 and target_shot.stat().st_size > 1000,
                }
                results.append({
                    "slug": slug,
                    "viewport": viewport_name,
                    "pass": all(checks.values()),
                    "checks": checks,
                    "source_url": source["finalUrl"],
                    "target_url": route_for(target, slug),
                    "source_html_sha256": page_contract["source_html_sha256"],
                    "source_screenshot": str(source_shot.relative_to(HERE)),
                    "source_screenshot_sha256": file_sha(source_shot),
                    "target_screenshot": str(target_shot.relative_to(HERE)),
                    "target_screenshot_sha256": file_sha(target_shot),
                    "source_height": source_metrics["height"],
                    "target_height": target_metrics["height"],
                    "height_ratio": height_ratio,
                    "source_regions": source_metrics["regions"],
                    "target_blocks": target_metrics["blocks"],
                    "mapped_tokens": mapped_tokens,
                    "target_max_block_gap": target_metrics["maxBlockGap"],
                    "source_overflow": source_metrics["overflow"],
                    "target_overflow": target_metrics["overflow"],
                })
        browser.close()

    receipt = {
        "ok": all(item["pass"] for item in results),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "baseline": "Final B",
        "target": target,
        "pages": len(PAGES),
        "viewports": len(VIEWPORTS),
        "pairs": len(results),
        "screenshots": len(results) * 2,
        "passed": sum(item["pass"] for item in results),
        "failed": sum(not item["pass"] for item in results),
        "comparison_role": "source/target review evidence; exact content fidelity is independently enforced by source-region-fidelity.json",
        "results": results,
    }
    output = HERE / "receipts/source-preview-visual-qa.json"
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("ok", "pages", "viewports", "pairs", "screenshots", "passed", "failed")}, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)


if __name__ == "__main__":
    main()
