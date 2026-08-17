#!/usr/bin/env python3
"""Final B browser gate for every clean/template route at three viewports."""

import argparse
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
BASELINE = HERE.parent / "lowen-baseline-a"
PAGES = json.loads((BASELINE / "migration/pages.json").read_text())
SITE = json.loads((BASELINE / "migration/site.json").read_text())
SOURCE_LEDGER = json.loads((HERE / "receipts/source-region-fidelity.json").read_text())
SOURCE_BY_SLUG = {item["slug"]: item for item in SOURCE_LEDGER["pages"]}
def flatten_navigation(items: list[dict]) -> list[dict]:
    result = []
    for item in sorted(items, key=lambda value: value["sort"]):
        result.append({"label": item["label"], "url": item["url"]})
        result.extend(flatten_navigation(item.get("children") or []))
    return result


EXPECTED_NAV = flatten_navigation(SITE["navigation"])
EXPECTED_ROOT_NAV = len(SITE["navigation"])
EXPECTED_SUBNAV = sum(len(item.get("children") or []) for item in SITE["navigation"])
SLUGS = {page["slug"] for page in PAGES}
UTILITY_PATHS = {"sitemap"}
REVIEWED_SOURCE_STYLE_AXE_EXCEPTIONS = {"color-contrast", "link-in-text-block"}
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "tablet": {"width": 820, "height": 1080},
    "mobile": {"width": 390, "height": 844},
}
TOKEN = re.compile(r"[a-z0-9]+(?:['’][a-z0-9]+)?", re.I)


def route_for(target: str, slug: str, family: str) -> str:
    if family == "clean":
        return target if slug == "home" else f"{target}/{slug}/"
    base = f"{target}/template-preview/pearl"
    return base if slug == "home" else f"{base}/{slug}/"


def expected_heading(page: dict) -> str:
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
            expected_counter = SOURCE_BY_SLUG[source_page["slug"]]["copy"]["mapped_counter"]
            expected_tokens = sum(expected_counter.values())
            for family in ("clean", "template"):
                for viewport_name, viewport in VIEWPORTS.items():
                    page = browser.new_page(viewport=viewport)
                    console_errors, page_errors, response_errors = [], [], []

                    def record_console_error(message):
                        location_host = urlparse((message.location or {}).get("url", "")).netloc
                        if message.type == "error" and (not location_host or location_host == target_host) and "Failed to load resource" not in message.text:
                            console_errors.append(message.text)

                    page.on("console", record_console_error)
                    page.on("pageerror", lambda error: page_errors.append(str(error)))
                    page.on("response", lambda response: response_errors.append({"status": response.status, "url": response.url}) if response.status >= 400 and urlparse(response.url).netloc == target_host else None)
                    started = time.monotonic()
                    response = page.goto(route_for(target, source_page["slug"], family), wait_until="networkidle")
                    load_ms = round((time.monotonic() - started) * 1000)
                    page.add_script_tag(path=str(axe_path))
                    violations = page.evaluate("""
                        async () => (await axe.run(document, {
                          runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa']}
                        })).violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.length, help:v.help}))
                    """)
                    evidence = page.evaluate("""
                        () => {
                          const blocks = [...document.querySelectorAll('[data-pearl-block]')];
                          const rects = blocks.map(node => {
                            const rect = node.getBoundingClientRect();
                            return {type: node.dataset.pearlBlock, top: rect.top + scrollY, bottom: rect.bottom + scrollY, width: rect.width, height: rect.height};
                          });
                          const gaps = rects.slice(1).map((rect, index) => Math.max(0, Math.round(rect.top - rects[index].bottom)));
                          return {
                            pageSlug: document.body.dataset.pageSlug || '',
                            blocks: blocks.map(node => node.dataset.pearlBlock),
                            blockRects: rects,
                            maxBlockGap: Math.max(0, ...gaps),
                            mainText: blocks.map(node => node.innerText || '').join(' '),
                            accessibleLabels: [...document.querySelectorAll('.pearl-snippet-quote [aria-label]')].map(node => node.getAttribute('aria-label') || '').join(' '),
                            documentHeight: document.documentElement.scrollHeight,
                            overflow: document.documentElement.scrollWidth - window.innerWidth,
                            brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
                            missingAlt: [...document.images].filter(img => !img.hasAttribute('alt')).map(img => img.src),
                            robots: document.querySelector('meta[name="robots"]')?.content || '',
                            title: document.title,
                            description: document.querySelector('meta[name="description"]')?.content || '',
                            h1s: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim() || ''),
                            nav: [...document.querySelectorAll('#pearl-primary-navigation a')].map(node => ({label:node.textContent?.trim() || '',url:node.getAttribute('href')})),
                            rootNavCount: document.querySelectorAll('.pearl-nav-root > .pearl-nav-item').length,
                            submenuCount: document.querySelectorAll('.pearl-submenu a').length,
                            ctaIndexes: blocks.map((node,index) => node.dataset.pearlBlock === 'cta_section_standard' ? index : -1).filter(index => index >= 0),
                            paragraphButtons: [...document.querySelectorAll('.pearl-prose a.paragraph-button')].map(node => node.textContent?.trim() || ''),
                            highlightLinks: [...document.querySelectorAll('.pearl-highlight-links a')].map(node => node.textContent?.replace('↗','').trim() || ''),
                            iconMarks: document.querySelectorAll('.pearl-icons__mark').length,
                            iconLinkTitles: [...document.querySelectorAll('.pearl-icons__mark')].filter(node => Boolean(node.getAttribute('title'))).length,
                            overlayIconBodies: document.querySelectorAll('.pearl-icons--overlay .pearl-icons__list li > p').length,
                            servicesBackgroundPresent: (() => { const node=document.querySelector('.pearl-icons--services'); return Boolean(node && getComputedStyle(node).backgroundImage.includes('url(')); })(),
                            snippetBeforeQuote: (() => { const section=document.querySelector('.pearl-snippet-quote'); const snippet=section?.querySelector('.pearl-snippet-quote__snippet'); const quote=section?.querySelector('blockquote'); return Boolean(snippet && quote && (snippet.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING)); })(),
                            hrefs: [...document.querySelectorAll('a[href]')].map(node => node.getAttribute('href')),
                            header: Boolean(document.querySelector('.pearl-site-header')),
                            footer: Boolean(document.querySelector('.pearl-site-footer')),
                          };
                        }
                    """)
                    rendered_text = f'{evidence["mainText"]} {evidence["accessibleLabels"]}'
                    rendered_tokens = len(TOKEN.findall(rendered_text))
                    rendered_counter = {}
                    for token in TOKEN.findall(rendered_text):
                        key = token.lower()
                        rendered_counter[key] = rendered_counter.get(key, 0) + 1
                    missing_content = {key: count - rendered_counter.get(key, 0) for key, count in expected_counter.items() if rendered_counter.get(key, 0) < count}
                    unsupported_content = {key: count - expected_counter.get(key, 0) for key, count in rendered_counter.items() if expected_counter.get(key, 0) < count}
                    token_ratio = round(rendered_tokens / expected_tokens, 3) if expected_tokens else 1.0
                    invalid_internal = []
                    for href in evidence["hrefs"]:
                        parsed = urlparse(href)
                        if parsed.scheme or parsed.netloc or href.startswith(("mailto:", "tel:")):
                            continue
                        if href.startswith("#") or "/template-preview/" in href or "/p/" in href or href.endswith(".asp"):
                            invalid_internal.append(href)
                            continue
                        path_slug = parsed.path.strip("/")
                        if path_slug and path_slug not in SLUGS and path_slug not in UTILITY_PATHS and not parsed.path.startswith("/lowen-assets/"):
                            invalid_internal.append(href)

                    blocking_violations = [
                        violation for violation in violations
                        if violation["id"] not in REVIEWED_SOURCE_STYLE_AXE_EXCEPTIONS
                    ]

                    toggle = page.locator(".pearl-menu-toggle")
                    navigation = page.locator("#pearl-primary-navigation")
                    if viewport["width"] <= 900:
                        nav_behavior = {"toggle_visible": toggle.is_visible(), "closed_initially": not navigation.is_visible()}
                        toggle.focus()
                        page.keyboard.press("Enter")
                        parent_toggle = navigation.locator(".pearl-submenu-toggle").first
                        parent_toggle.click()
                        nav_behavior.update({"expanded": toggle.get_attribute("aria-expanded") == "true", "opened": navigation.is_visible(), "link_count": navigation.locator("a").count() == len(EXPECTED_NAV), "root_count": evidence["rootNavCount"] == EXPECTED_ROOT_NAV, "submenu_count": evidence["submenuCount"] == EXPECTED_SUBNAV, "submenu_expanded": parent_toggle.get_attribute("aria-expanded") == "true", "submenu_visible": navigation.locator(".pearl-submenu").first.is_visible()})
                        page.keyboard.press("Escape")
                        nav_behavior["escape_closed"] = not navigation.is_visible()
                    else:
                        first_parent = navigation.locator("[data-pearl-nav-parent]").first
                        first_parent.hover()
                        page.wait_for_timeout(250)
                        nav_behavior = {"toggle_hidden": not toggle.is_visible(), "navigation_visible": navigation.is_visible(), "link_count": navigation.locator("a").count() == len(EXPECTED_NAV), "root_count": evidence["rootNavCount"] == EXPECTED_ROOT_NAV, "submenu_count": evidence["submenuCount"] == EXPECTED_SUBNAV, "submenu_visible_on_hover": first_parent.locator(".pearl-submenu").is_visible()}

                    semantic_dom_fidelity = len(evidence["ctaIndexes"]) <= 1 and (not evidence["ctaIndexes"] or evidence["ctaIndexes"][0] == len(evidence["blocks"]) - 1)
                    if source_page["slug"] == "home":
                        semantic_dom_fidelity = semantic_dom_fidelity and evidence["overlayIconBodies"] == 0 and evidence["iconMarks"] > 0 and evidence["iconLinkTitles"] == evidence["iconMarks"] and evidence["servicesBackgroundPresent"] and evidence["snippetBeforeQuote"] and len(evidence["paragraphButtons"]) >= 2
                    if source_page["slug"] == "about-us":
                        semantic_dom_fidelity = semantic_dom_fidelity and evidence["highlightLinks"] == ["Meet Dr. Krista Lowen", "Meet Dr. Lillian Nguyen", "Testimonials"]

                    checks = {
                        "status_200": bool(response and response.status == 200),
                        "route_identity": evidence["pageSlug"] == source_page["slug"],
                        "source_object_sequence": evidence["blocks"] == expected_blocks,
                        "one_source_h1": len(evidence["h1s"]) == 1 and (not heading or evidence["h1s"][0] == heading),
                        "source_navigation_clean": evidence["nav"] == EXPECTED_NAV,
                        "navigation_behavior": all(nav_behavior.values()),
                        "semantic_dom_fidelity": semantic_dom_fidelity,
                        "internal_links_clean_and_known": not invalid_internal,
                        "no_horizontal_overflow": evidence["overflow"] <= 1,
                        "images_loaded": not evidence["brokenImages"],
                        "images_described": not evidence["missingAlt"],
                        "blocks_visible": all(rect["width"] > 0 and rect["height"] > 0 for rect in evidence["blockRects"]),
                        "section_gap_sane": evidence["maxBlockGap"] <= 16,
                        "content_exact": not missing_content and not unsupported_content,
                        "seo_present": bool(evidence["title"] and evidence["description"]),
                        "no_console_errors": not console_errors,
                        "no_page_errors": not page_errors,
                        "no_first_party_http_errors": not response_errors,
                        "load_under_10s": load_ms < 10000,
                        "noindex": "noindex" in evidence["robots"] and "nofollow" in evidence["robots"],
                        "shared_chrome": evidence["header"] and evidence["footer"],
                        "wcag_aa": not blocking_violations,
                    }
                    results.append({
                        "slug": source_page["slug"], "route_family": family, "viewport": viewport_name, "url": route_for(target, source_page["slug"], family),
                        "pass": all(checks.values()), "checks": checks, "expected_blocks": expected_blocks, "rendered_blocks": evidence["blocks"],
                        "page_slug": evidence["pageSlug"], "h1s": evidence["h1s"], "load_ms": load_ms, "document_height": evidence["documentHeight"],
                        "max_block_gap": evidence["maxBlockGap"], "expected_content_tokens": expected_tokens, "rendered_content_tokens": rendered_tokens, "content_token_ratio": token_ratio,
                        "missing_content_tokens": missing_content, "unsupported_content_tokens": unsupported_content,
                        "overflow_pixels": evidence["overflow"], "invalid_internal_links": invalid_internal, "broken_images": evidence["brokenImages"], "missing_alt": evidence["missingAlt"],
                        "console_errors": console_errors, "page_errors": page_errors, "first_party_http_errors": response_errors, "accessibility_violations": violations, "blocking_accessibility_violations": blocking_violations, "navigation_evidence": nav_behavior,
                        "semantic_evidence": {key: evidence[key] for key in ("ctaIndexes", "paragraphButtons", "highlightLinks", "iconMarks", "iconLinkTitles", "overlayIconBodies", "servicesBackgroundPresent", "snippetBeforeQuote")},
                    })
                    page.close()
        browser.close()

    receipt = {
        "ok": all(item["pass"] for item in results),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "baseline": "Final B", "target": target, "routes": len(PAGES), "route_families": 2, "viewports": len(VIEWPORTS), "checks": len(results),
        "passed": sum(item["pass"] for item in results), "failed": sum(not item["pass"] for item in results), "results": results,
    }
    output = HERE / "receipts/route-matrix-qa.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("ok", "target", "routes", "route_families", "viewports", "checks", "passed", "failed")}, indent=2))
    if receipt["failed"]:
        failed_checks = {}
        for item in results:
            for check, passed in item["checks"].items():
                if not passed:
                    failed_checks[check] = failed_checks.get(check, 0) + 1
        print(json.dumps({"failed_checks": failed_checks}, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)


if __name__ == "__main__":
    main()
