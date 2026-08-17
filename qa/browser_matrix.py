#!/usr/bin/env python3
"""Browser acceptance matrix for one representative route per page family."""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGES = json.loads((ROOT / "site/src/content/frozen/pages.json").read_text())
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "tablet": {"width": 768, "height": 1024},
    "mobile": {"width": 390, "height": 844},
}

IGNORED_THIRD_PARTY_CONSOLE_ERRORS = (
    "Permissions policy violation: compute-pressure is not allowed in this document.",
    "Failed to load resource: the server responded with a status of 404 ()",
)
GOOGLE_MAPS_HOSTS = {"maps.googleapis.com", "maps.gstatic.com"}


def is_google_maps_embed_error(message):
    """Ignore only known failures emitted inside Google's third-party map embed."""
    text = message.text
    location_url = (message.location or {}).get("url", "")
    location_host = urlparse(location_url).netloc
    text_names_google_maps = (
        "maps.googleapis.com/$rpc/google.internal.maps.mapsjs" in text
        or "maps.gstatic.com/maps-api-v3/embed/" in text
    )
    known_embed_failure = (
        "google is not defined" in text
        or "blocked by CORS policy" in text
        or "net::ERR_FAILED" in text
        or text.startswith("Failed to load resource:")
    )
    return known_embed_failure and (
        location_host in GOOGLE_MAPS_HOSTS or text_names_google_maps
    )


def record_console_error(message, errors):
    if message.type != "error":
        return
    if message.text in IGNORED_THIRD_PARTY_CONSOLE_ERRORS:
        return
    if is_google_maps_embed_error(message):
        return
    errors.append(message.text)


def record_first_party_response_error(response, target_host, errors):
    if response.status < 400:
        return
    if urlparse(response.url).netloc != target_host:
        return
    errors.append({"status": response.status, "url": response.url})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    target = args.target.rstrip("/")
    target_host = urlparse(target).netloc
    axe_path = ROOT / "site/node_modules/axe-core/axe.min.js"
    if not axe_path.exists():
        raise SystemExit("axe-core is missing; run npm ci in site/")
    routes = {}
    for page in PAGES:
        routes.setdefault(page["family"], page["legacy_path"])

    results = []
    with sync_playwright() as playwright:
        cache = Path.home() / "Library/Caches/ms-playwright"
        installed = sorted(cache.glob("chromium_headless_shell-*/chrome-mac*/headless_shell"))
        executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        if not executable and installed:
            executable = str(installed[-1])
        browser = playwright.chromium.launch(headless=True, executable_path=executable)
        for family, route in sorted(routes.items()):
            for viewport_name, viewport in VIEWPORTS.items():
                page = browser.new_page(viewport=viewport)
                console_errors = []
                page_errors = []
                response_errors = []
                page.on("console", lambda message: record_console_error(message, console_errors))
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                page.on("response", lambda response: record_first_party_response_error(
                    response, target_host, response_errors))
                response = page.goto(f"{target}{route}", wait_until="networkidle")
                page.add_script_tag(path=str(axe_path))
                axe_violations = page.evaluate("""
                    async () => (await axe.run(document, {
                      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
                    })).violations.map(v => ({
                      id: v.id,
                      impact: v.impact,
                      nodes: v.nodes.length,
                      help: v.help,
                    }))
                """)
                evidence = page.evaluate("""
                    () => ({
                      overflow: document.documentElement.scrollWidth - window.innerWidth,
                      brokenImages: [...document.images]
                        .filter(img => img.complete && img.naturalWidth === 0)
                        .map(img => img.getAttribute('src')),
                      robots: document.querySelector('meta[name="robots"]')?.content || '',
                      fidelityRoot: Boolean(document.querySelector('[data-fidelity-root]')),
                      articleCount: document.querySelectorAll('[data-source-article]').length,
                      primaryLinks: document.querySelectorAll('.site-nav a').length,
                      noopForms: [...document.forms]
                        .every(form => form.dataset.reviewNoop === 'true' && form.getAttribute('action') === ''),
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
                    "fidelity_root": evidence["fidelityRoot"],
                    "source_articles": evidence["articleCount"] >= 1,
                    "source_navigation": evidence["primaryLinks"] >= 5,
                    "forms_inert": evidence["noopForms"],
                    "wcag_aa": not axe_violations,
                }
                results.append({
                    "family": family,
                    "route": route,
                    "viewport": viewport_name,
                    "width": viewport["width"],
                    "pass": all(checks.values()),
                    "checks": checks,
                    "overflow_pixels": evidence["overflow"],
                    "broken_images": evidence["brokenImages"],
                    "console_errors": console_errors,
                    "page_errors": page_errors,
                    "first_party_http_errors": response_errors,
                    "accessibility_violations": axe_violations,
                })
                page.close()
        browser.close()

    receipt = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": target,
        "families": len(routes),
        "viewports": list(VIEWPORTS),
        "checks": len(results),
        "passed": sum(item["pass"] for item in results),
        "failed": sum(not item["pass"] for item in results),
        "results": results,
    }
    path = ROOT / "qa/browser-matrix-results.json"
    path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in
                      ("target", "families", "viewports", "checks", "passed", "failed")}, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)


if __name__ == "__main__":
    main()
