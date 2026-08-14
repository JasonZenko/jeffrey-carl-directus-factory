#!/usr/bin/env python3
"""Permanent inner-page component and mobile receipt for the Carolina POC."""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CASES = {
    "about-our-office": ["inner_hero_standard", "flex_content_section", "flex_content_section", "image_gallery_grid"],
    "services": ["inner_hero_standard", "flex_content_section", "highlight_links"],
    "services-family-dentistry-root-canals": ["inner_hero_standard", "flex_content_section", "flex_content_section"],
    "contact-us": ["inner_hero_standard", "flex_content_section", "contact_info_standard", "cta_section_standard"],
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    target = args.target.rstrip("/")
    target_host = urlparse(target).netloc
    results = []
    with sync_playwright() as playwright:
        executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        launch = {"headless": True}
        if executable:
            launch["executable_path"] = executable
        browser = playwright.chromium.launch(**launch)
        for slug, expected_blocks in CASES.items():
            page = browser.new_page(viewport={"width": 390, "height": 844})
            console_errors = []
            page_errors = []
            response_errors = []
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on("response", lambda response: response_errors.append({"status": response.status, "url": response.url})
                    if response.status >= 400 and urlparse(response.url).netloc == target_host else None)
            response = page.goto(f"{target}/{slug}/", wait_until="networkidle")
            evidence = page.evaluate("""
                () => ({
                  blocks: [...document.querySelectorAll('[data-pearl-block]')].map(node => node.dataset.pearlBlock),
                  overflow: document.documentElement.scrollWidth - window.innerWidth,
                  brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
                  robots: document.querySelector('meta[name="robots"]')?.content || '',
                  h1: document.querySelector('h1')?.textContent?.trim() || '',
                })
            """)
            checks = {
                "status_200": bool(response and response.status == 200),
                "expected_components": evidence["blocks"] == expected_blocks,
                "has_source_h1": bool(evidence["h1"]),
                "no_horizontal_overflow": evidence["overflow"] <= 1,
                "images_loaded": not evidence["brokenImages"],
                "no_console_errors": not console_errors,
                "no_page_errors": not page_errors,
                "no_first_party_http_errors": not response_errors,
                "noindex": "noindex" in evidence["robots"],
            }
            results.append({
                "slug": slug,
                "pass": all(checks.values()),
                "checks": checks,
                "blocks": evidence["blocks"],
                "h1": evidence["h1"],
                "overflow_pixels": evidence["overflow"],
                "broken_images": evidence["brokenImages"],
                "console_errors": console_errors,
                "page_errors": page_errors,
                "first_party_http_errors": response_errors,
            })
            page.close()
        browser.close()
    receipt = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": target,
        "checks": len(results),
        "passed": sum(item["pass"] for item in results),
        "failed": sum(not item["pass"] for item in results),
        "results": results,
    }
    output = ROOT / "receipts/inner-page-qa.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("target", "checks", "passed", "failed")}, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)


if __name__ == "__main__":
    main()
