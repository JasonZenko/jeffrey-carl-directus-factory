#!/usr/bin/env python3
"""Responsive, image and WCAG acceptance for the source-derived Lowen home."""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "tablet": {"width": 820, "height": 1080},
    "mobile": {"width": 390, "height": 844},
}
EXPECTED_HOME = json.loads((ROOT / "migration/mapping-receipt.json").read_text())["homepage_sequence"]
EXPECTED_SITE = json.loads((ROOT / "migration/site.json").read_text())
EXPECTED_NAV_COUNT = sum(1 + len(item.get("children", [])) for item in EXPECTED_SITE["navigation"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    target = args.target.rstrip("/")
    target_host = urlparse(target).netloc
    axe_path = REPO / "site/node_modules/axe-core/axe.min.js"
    if not axe_path.exists():
        raise SystemExit("axe-core is missing; run npm ci in site/")
    results = []
    with sync_playwright() as playwright:
        executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        launch = {"headless": True}
        if executable:
            launch["executable_path"] = executable
        browser = playwright.chromium.launch(**launch)
        for name, viewport in VIEWPORTS.items():
            page = browser.new_page(viewport=viewport)
            console_errors, page_errors, response_errors = [], [], []
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on("response", lambda response: response_errors.append({"status": response.status, "url": response.url})
                    if response.status >= 400 and urlparse(response.url).netloc == target_host else None)
            response = page.goto(target, wait_until="networkidle")
            page.add_script_tag(path=str(axe_path))
            violations = page.evaluate("""
                async () => (await axe.run(document, {
                  runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa']}
                })).violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.length, help:v.help}))
            """)
            evidence = page.evaluate("""
                () => ({
                  overflow: document.documentElement.scrollWidth - window.innerWidth,
                  brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
                  missingAlt: [...document.images].filter(img => !img.hasAttribute('alt')).map(img => img.src),
                  blockSequence: [...document.querySelectorAll('[data-pearl-block]')].map(node => node.dataset.pearlBlock),
                  robots: document.querySelector('meta[name="robots"]')?.content || '',
                  theme: getComputedStyle(document.documentElement).getPropertyValue('--pearl-primary').trim(),
                  header: Boolean(document.querySelector('.pearl-site-header')),
                  footer: Boolean(document.querySelector('.pearl-site-footer')),
                  logo: Boolean(document.querySelector('.pearl-brand img')),
                  navHrefs: [...document.querySelectorAll('#pearl-primary-navigation a')].map(node => node.getAttribute('href')),
                })
            """)
            toggle = page.locator(".pearl-menu-toggle")
            navigation = page.locator("#pearl-primary-navigation")
            if name == "mobile":
                navigation_evidence = {"toggle_visible": toggle.is_visible(), "closed_initially": not navigation.is_visible()}
                toggle.click()
                navigation_evidence.update({
                    "expanded": toggle.get_attribute("aria-expanded") == "true",
                    "opened": navigation.is_visible(),
                    "link_count": navigation.locator("a").count() == EXPECTED_NAV_COUNT,
                })
                page.keyboard.press("Escape")
                navigation_evidence.update({"escape_closed": not navigation.is_visible()})
            else:
                navigation_evidence = {
                    "toggle_hidden": not toggle.is_visible(),
                    "navigation_visible": navigation.is_visible(),
                    "link_count": navigation.locator("a").count() == EXPECTED_NAV_COUNT,
                }
            checks = {
                "status_200": bool(response and response.status == 200),
                "no_horizontal_overflow": evidence["overflow"] <= 1,
                "images_loaded": not evidence["brokenImages"],
                "images_described": not evidence["missingAlt"],
                "no_console_errors": not console_errors,
                "no_page_errors": not page_errors,
                "no_first_party_http_errors": not response_errors,
                "noindex": "noindex" in evidence["robots"],
                "source_homepage_composition": evidence["blockSequence"] == EXPECTED_HOME,
                "source_navigation": len(evidence["navHrefs"]) == EXPECTED_NAV_COUNT and all(not href.startswith("#") for href in evidence["navHrefs"]),
                "source_logo": evidence["logo"],
                "theme_connected": evidence["theme"].startswith("#") and len(evidence["theme"]) == 7,
                "shared_chrome": evidence["header"] and evidence["footer"],
                "responsive_navigation": all(navigation_evidence.values()),
                "wcag_aa": not violations,
            }
            results.append({
                "viewport": name, "pass": all(checks.values()), "checks": checks,
                "overflow_pixels": evidence["overflow"], "broken_images": evidence["brokenImages"],
                "console_errors": console_errors, "page_errors": page_errors,
                "first_party_http_errors": response_errors, "accessibility_violations": violations,
                "navigation_evidence": navigation_evidence,
            })
            page.close()
        browser.close()
    receipt = {
        "generated_at": datetime.now(timezone.utc).isoformat(), "target": target,
        "checks": len(results), "passed": sum(item["pass"] for item in results),
        "failed": sum(not item["pass"] for item in results), "results": results,
    }
    output = ROOT / "receipts/responsive-qa.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("target", "checks", "passed", "failed")}, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)


if __name__ == "__main__":
    main()
