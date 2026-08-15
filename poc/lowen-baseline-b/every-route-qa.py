#!/usr/bin/env python3
"""Every-route, three-viewport acceptance for frozen Lowen Baseline B."""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
BASELINE_A = ROOT.parent / "lowen-baseline-a"
REPO = ROOT.parents[1]
PAGES = json.loads((BASELINE_A / "migration/pages.json").read_text())
SITE = json.loads((BASELINE_A / "migration/site.json").read_text())
EXPECTED_NAV = sorted(SITE["navigation"], key=lambda item: item["sort"])
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "tablet": {"width": 820, "height": 1080},
    "mobile": {"width": 390, "height": 844},
}


def route_for(target, slug):
    return target if slug == "home" else f"{target}/{slug}/"


def expected_heading(page):
    for block in page["blocks"]:
        if block["type"] == "inner_hero_standard":
            return block["item"].get("page_title", "")
        if block["type"] == "main_hero_standard":
            return block["item"].get("heading", "")
    return ""


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
        launch = {"headless": True}
        if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
            launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]
        browser = playwright.chromium.launch(**launch)
        for source_page in PAGES:
            expected_blocks = [block["type"] for block in source_page["blocks"]]
            heading = expected_heading(source_page)
            for viewport_name, viewport in VIEWPORTS.items():
                page = browser.new_page(viewport=viewport)
                console_errors, page_errors, response_errors = [], [], []
                def record_console_error(message):
                    location_host = urlparse((message.location or {}).get("url", "")).netloc
                    if message.type == "error" and (not location_host or location_host == target_host) and "Failed to load resource" not in message.text:
                        console_errors.append(message.text)
                page.on("console", record_console_error)
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                page.on("response", lambda response: response_errors.append({"status": response.status, "url": response.url})
                        if response.status >= 400 and urlparse(response.url).netloc == target_host else None)
                response = page.goto(route_for(target, source_page["slug"]), wait_until="networkidle")
                page.add_script_tag(path=str(axe_path))
                violations = page.evaluate("""
                    async () => (await axe.run(document, {
                      runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa']}
                    })).violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.length, help:v.help}))
                """)
                evidence = page.evaluate("""
                    () => ({
                      blocks: [...document.querySelectorAll('[data-pearl-block]')].map(node => node.dataset.pearlBlock),
                      overflow: document.documentElement.scrollWidth - window.innerWidth,
                      brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
                      missingAlt: [...document.images].filter(img => !img.hasAttribute('alt')).map(img => img.src),
                      robots: document.querySelector('meta[name="robots"]')?.content || '',
                      h1s: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim() || ''),
                      nav: [...document.querySelectorAll('#pearl-primary-navigation a')].map(node => ({label:node.textContent?.trim() || '',url:node.getAttribute('href')})),
                      anchorLinks: [...document.querySelectorAll('a[href^="#"]')].map(node => node.getAttribute('href')),
                      legacyLinks: [...document.querySelectorAll('a[href]')].map(node => node.getAttribute('href')).filter(href => {
                        try { return ['http:', 'https:'].includes(new URL(href, location.href).protocol) && new URL(href, location.href).hostname === 'www.lowenperio.com'; }
                        catch { return false; }
                      }),
                      header: Boolean(document.querySelector('.pearl-site-header')),
                      footer: Boolean(document.querySelector('.pearl-site-footer')),
                    })
                """)
                toggle = page.locator(".pearl-menu-toggle")
                navigation = page.locator("#pearl-primary-navigation")
                if viewport_name == "mobile":
                    nav_behavior = {"toggle_visible": toggle.is_visible(), "closed_initially": not navigation.is_visible()}
                    toggle.click()
                    nav_behavior.update({
                        "expanded": toggle.get_attribute("aria-expanded") == "true",
                        "opened": navigation.is_visible(),
                        "link_count": navigation.locator("a").count() == len(EXPECTED_NAV),
                    })
                    page.keyboard.press("Escape")
                    nav_behavior["escape_closed"] = not navigation.is_visible()
                else:
                    nav_behavior = {
                        "toggle_hidden": not toggle.is_visible(),
                        "navigation_visible": navigation.is_visible(),
                        "link_count": navigation.locator("a").count() == len(EXPECTED_NAV),
                    }
                checks = {
                    "status_200": bool(response and response.status == 200),
                    "source_object_sequence": evidence["blocks"] == expected_blocks,
                    "one_source_h1": len(evidence["h1s"]) == 1 and (not heading or evidence["h1s"][0] == heading),
                    "source_navigation": evidence["nav"] == [{"label": item["label"], "url": item["url"]} for item in EXPECTED_NAV],
                    "navigation_behavior": all(nav_behavior.values()),
                    "no_shell_or_legacy_links": not evidence["anchorLinks"] and not evidence["legacyLinks"],
                    "no_horizontal_overflow": evidence["overflow"] <= 1,
                    "images_loaded": not evidence["brokenImages"],
                    "images_described": not evidence["missingAlt"],
                    "no_console_errors": not console_errors,
                    "no_page_errors": not page_errors,
                    "no_first_party_http_errors": not response_errors,
                    "noindex": "noindex" in evidence["robots"],
                    "shared_chrome": evidence["header"] and evidence["footer"],
                    "wcag_aa": not violations,
                }
                results.append({
                    "slug": source_page["slug"], "viewport": viewport_name, "pass": all(checks.values()),
                    "checks": checks, "expected_blocks": expected_blocks, "rendered_blocks": evidence["blocks"],
                    "h1s": evidence["h1s"], "overflow_pixels": evidence["overflow"],
                    "broken_images": evidence["brokenImages"], "missing_alt": evidence["missingAlt"],
                    "console_errors": console_errors, "page_errors": page_errors,
                    "first_party_http_errors": response_errors, "accessibility_violations": violations,
                    "navigation_evidence": nav_behavior,
                })
                page.close()
        browser.close()

    receipt = {
        "generated_at": datetime.now(timezone.utc).isoformat(), "baseline": "B", "target": target,
        "routes": len(PAGES), "viewports": len(VIEWPORTS), "checks": len(results),
        "passed": sum(item["pass"] for item in results), "failed": sum(not item["pass"] for item in results),
        "results": results,
    }
    output = ROOT / "receipts/every-route-browser-qa.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("target", "routes", "viewports", "checks", "passed", "failed")}, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)


if __name__ == "__main__":
    main()
