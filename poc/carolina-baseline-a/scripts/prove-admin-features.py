#!/usr/bin/env python3
"""Prove the isolated Directus admin, versioning and Visual Editor paths."""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright


def api(base: str, path: str, *, token: str | None = None, method: str = "GET", body=None):
    headers = {"Accept": "application/json", "User-Agent": "Pearl-POC-Proof/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    request = urllib.request.Request(f"{base}{path}", headers=headers, data=data, method=method)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        raise RuntimeError(f"{method} {path} returned {error.code}: {detail[:1200]}") from error
    return json.loads(payload).get("data") if payload else None


def prove_versioning(cms: str, email: str, password: str):
    auth = api(cms, "/auth/login", method="POST", body={"email": email, "password": password})
    token = auth["access_token"]
    query = urllib.parse.urlencode({
        "filter[slug][_eq]": "services-family-dentistry-root-canals",
        "limit": 1,
        "fields": "id,slug,title,status,workflow_status,robots_index,robots_follow",
    })
    main_before = api(cms, f"/items/pearl_pages?{query}", token=token)[0]
    stamp = int(time.time())
    version = api(cms, "/versions", token=token, method="POST", body={
        "key": f"poc-proof-{stamp}",
        "name": "POC disposable version proof",
        "collection": "pearl_pages",
        "item": main_before["id"],
    })
    retrieved = api(cms, f"/versions/{version['id']}?fields=id,key,name,collection,item", token=token)
    api(cms, f"/versions/{version['id']}", token=token, method="DELETE")
    remaining = api(cms, f"/versions?filter[id][_eq]={version['id']}&limit=1&fields=id", token=token)
    main_after = api(cms, f"/items/pearl_pages?{query}", token=token)[0]
    if remaining or main_before != main_after:
        raise RuntimeError("Disposable content-version proof did not restore a clean main item")
    return {
        "page": main_before["slug"],
        "created": retrieved["collection"] == "pearl_pages" and str(retrieved["item"]) == str(main_before["id"]),
        "deleted": len(remaining) == 0,
        "main_unchanged": main_before == main_after,
    }


def prove_visual_editor(cms: str, review: str, email: str, password: str, screenshot: str):
    console_errors: list[str] = []
    response_errors: list[dict[str, object]] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("response", lambda response: response_errors.append({
            "status": response.status,
            "url": response.url,
        }) if response.status >= 400 else None)
        page.goto(f"{cms}/admin/login", wait_until="domcontentloaded", timeout=90000)
        if "/admin/login" in page.url:
            page.locator('input[type="email"]').fill(email)
            page.locator('input[type="password"]').fill(password)
            page.locator('button[type="submit"]').click()
            page.wait_for_function("() => !location.pathname.includes('/admin/login')", timeout=90000)
        page.goto(f"{cms}/admin/visual", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(5000)
        if page.locator("iframe").count() == 0:
            page.screenshot(path=screenshot, full_page=True)
            body = page.locator("body").inner_text()[:1200]
            raise RuntimeError(f"Visual Editor iframe missing at {page.url}: {body}")
        iframe = page.locator("iframe").first
        iframe.wait_for(state="attached", timeout=90000)
        handle = iframe.element_handle()
        frame = handle.content_frame() if handle else None
        if frame is None:
            raise RuntimeError("Visual Editor iframe has no browser frame")
        frame.wait_for_load_state("domcontentloaded", timeout=90000)
        if not frame.url.startswith(f"{review}/") and frame.url != review:
            raise RuntimeError(f"Visual Editor loaded the wrong review URL: {frame.url}")
        frame.locator("[data-directus]").first.wait_for(state="attached", timeout=90000)
        page.wait_for_timeout(7000)
        annotations = frame.locator("[data-directus]").count()
        blocks = frame.locator("[data-pearl-block]").count()
        parent_controls = page.locator("button").evaluate_all("""buttons => buttons.map(button => ({
          aria: button.getAttribute('aria-label') || '',
          title: button.getAttribute('title') || '',
          text: (button.innerText || '').trim()
        })).filter(control => control.aria || control.title || control.text)""")
        point_controls = page.evaluate("""() => document.elementsFromPoint(130, 28).map(element => ({
          tag: element.tagName,
          className: String(element.className || ''),
          aria: element.getAttribute('aria-label') || '',
          text: (element.innerText || '').trim().slice(0, 120)
        })).slice(0, 12)""")
        header_html = page.locator(".header").inner_html()[:6000]
        ai_toggle = page.locator('.header .ai-magic-button').first.locator("xpath=ancestor::button")
        if ai_toggle.count() and "active" in (ai_toggle.get_attribute("class") or ""):
            ai_toggle.click(force=True)
            page.wait_for_timeout(1000)
        mode_toggle = page.locator('.header i[data-icon="edit"]').first.locator("xpath=ancestor::button")
        if mode_toggle.count():
            mode_toggle.click(force=True)
        else:
            # Directus 11 renders the Visual Editor pencil as an icon-only
            # control without an accessible button label.
            page.mouse.click(130, 28)
        page.wait_for_timeout(3500)
        edit_buttons = frame.locator('.directus-visual-editing-edit-button, button[aria-label*="Edit" i], button[title*="Edit" i], button:has(i[data-icon="edit"])')
        edit_controls = edit_buttons.count()
        drawer_opened = False
        if edit_controls:
            edit_buttons.first.click(force=True)
            page.wait_for_timeout(2500)
            drawer_opened = (
                page.get_by_text("Pearl Main Hero Standard", exact=False).count() > 0
                or page.get_by_text("Pearl Theme Settings", exact=False).count() > 0
                or page.locator(".drawer").count() > 0
            )
        page.screenshot(path=screenshot, full_page=True)
        iframe_url = frame.url
        browser.close()
    blocking_response_errors = [
        failure for failure in response_errors
        if "/auth/refresh" not in str(failure["url"])
    ]
    generic_resource_errors = [
        message for message in console_errors
        if "Failed to load resource" in message
    ]
    blocking_errors = [
        message for message in console_errors
        if "/auth/refresh" not in message and message not in generic_resource_errors
    ]
    if blocking_response_errors:
        blocking_errors.extend(
            f"HTTP {failure['status']}: {failure['url']}"
            for failure in blocking_response_errors
        )
    if annotations < 9 or blocks != 7 or edit_controls < 1 or not drawer_opened:
        raise RuntimeError(json.dumps({
            "annotations": annotations,
            "blocks": blocks,
            "edit_controls": edit_controls,
            "drawer_opened": drawer_opened,
            "iframe_url": iframe_url,
            "parent_controls": parent_controls[:30],
            "point_controls": point_controls,
            "header_html": header_html,
            "console_errors": console_errors,
        }))
    return {
        "authenticated": True,
        "visual_editor_url": f"{cms}/admin/visual",
        "iframe_url": iframe_url,
        "annotations": annotations,
        "homepage_blocks": blocks,
        "edit_controls": edit_controls,
        "record_drawer_opened": drawer_opened,
        "blocking_console_errors": blocking_errors,
        "ignored_auth_refresh_errors": [
            failure for failure in response_errors
            if "/auth/refresh" in str(failure["url"])
        ],
        "screenshot": screenshot,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cms", default="https://pearl-poc-cms.foundryworks.ai")
    parser.add_argument("--review", default="https://pearl-carolina-poc.pages.dev")
    parser.add_argument("--receipt", default="poc/carolina-baseline-a/receipts/admin-features.json")
    parser.add_argument("--screenshot", default="/tmp/pearl-carolina-poc-visual-editor.png")
    args = parser.parse_args()
    email = os.environ.get("DIRECTUS_ADMIN_EMAIL")
    password = os.environ.get("DIRECTUS_ADMIN_PASSWORD")
    if not email or not password:
        raise RuntimeError("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD are required")
    cms = args.cms.rstrip("/")
    review = args.review.rstrip("/")
    receipt = {
        "ok": True,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "cms": cms,
        "review": review,
        "versioning": prove_versioning(cms, email, password),
        "visual_editor": prove_visual_editor(cms, review, email, password, args.screenshot),
    }
    target = Path(args.receipt)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({
        "ok": receipt["ok"],
        "versioning": receipt["versioning"],
        "visual_editor": {key: value for key, value in receipt["visual_editor"].items() if key != "screenshot"},
    }, indent=2))


if __name__ == "__main__":
    main()
