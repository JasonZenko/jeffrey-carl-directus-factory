#!/usr/bin/env python3
"""Responsive, image and WCAG acceptance checks for the Pearl reference site."""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "tablet": {"width": 820, "height": 1080},
    "mobile": {"width": 390, "height": 844},
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    target = args.target.rstrip("/")
    target_host = urlparse(target).netloc
    axe_path = ROOT / "site/node_modules/axe-core/axe.min.js"
    if not axe_path.exists():
        raise SystemExit("axe-core is missing; run npm ci in site/")

    results = []
    with sync_playwright() as playwright:
        cache = Path.home() / "Library/Caches/ms-playwright"
        installed = sorted(cache.glob("chromium_headless_shell-*/chrome-mac*/headless_shell"))
        executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        if not executable and installed:
            executable = str(installed[-1])
        browser = playwright.chromium.launch(headless=True, executable_path=executable)
        for name, viewport in VIEWPORTS.items():
            page = browser.new_page(viewport=viewport)
            console_errors = []
            page_errors = []
            response_errors = []
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on("response", lambda response: response_errors.append({"status": response.status, "url": response.url})
                    if response.status >= 400 and urlparse(response.url).netloc == target_host else None)
            response = page.goto(target, wait_until="networkidle")
            page.add_script_tag(path=str(axe_path))
            violations = page.evaluate("""
                async () => (await axe.run(document, {
                  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
                })).violations.map(v => ({
                  id: v.id,
                  impact: v.impact,
                  nodes: v.nodes.length,
                  help: v.help,
                  targets: v.nodes.map(node => ({target: node.target, summary: node.failureSummary}))
                }))
            """)
            evidence = page.evaluate("""
                () => ({
                  overflow: document.documentElement.scrollWidth - window.innerWidth,
                  brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
                  blocks: document.querySelectorAll('[data-pearl-block]').length,
                  blockSequence: [...document.querySelectorAll('[data-pearl-block]')].map(node => node.dataset.pearlBlock),
                  robots: document.querySelector('meta[name="robots"]')?.content || '',
                  theme: getComputedStyle(document.documentElement).getPropertyValue('--pearl-primary').trim(),
                  header: Boolean(document.querySelector('.pearl-site-header')),
                  footer: Boolean(document.querySelector('.pearl-site-footer')),
                })
            """)
            checks = {
                "status_200": bool(response and response.status == 200),
                "no_horizontal_overflow": evidence["overflow"] <= 1,
                "images_loaded": not evidence["brokenImages"],
                "no_console_errors": not console_errors,
                "no_page_errors": not page_errors,
                "no_first_party_http_errors": not response_errors,
                "noindex": "noindex" in evidence["robots"],
                "approved_homepage_sequence": evidence["blocks"] == 8 and evidence["blockSequence"] == [
                    "main_hero", "icon_circles", "flex_content_image", "icon_circles",
                    "patient_reviews", "flex_content_image", "areas_served_links", "inner_hero_cta",
                ],
                "theme_connected": evidence["theme"] == "#855d56",
                "shared_chrome": evidence["header"] and evidence["footer"],
                "wcag_aa": not violations,
            }
            results.append({
                "viewport": name,
                "pass": all(checks.values()),
                "checks": checks,
                "overflow_pixels": evidence["overflow"],
                "broken_images": evidence["brokenImages"],
                "console_errors": console_errors,
                "page_errors": page_errors,
                "first_party_http_errors": response_errors,
                "accessibility_violations": violations,
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
    output = ROOT / "qa/pearl-reference-results.json"
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("target", "checks", "passed", "failed")}, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)


if __name__ == "__main__":
    main()
