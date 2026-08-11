#!/usr/bin/env python3
"""Blocking visual-fidelity gate against the frozen six-family baselines."""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASELINES = json.loads((ROOT / "source-freeze/manifests/screenshots.json").read_text())
OUT = ROOT / "qa/visual-fidelity-results.json"
CAPTURES = ROOT / "qa/visual/current"


def difference_hash(image, size=32):
    gray = image.convert("L").resize((size + 1, size))
    pixels = list(gray.getdata())
    return [
        pixels[y * (size + 1) + x] > pixels[y * (size + 1) + x + 1]
        for y in range(size)
        for x in range(size)
    ]


def compare_top_viewport(baseline_path, current_path, width, height):
    baseline = Image.open(baseline_path).convert("RGB").crop((0, 0, width, height))
    current = Image.open(current_path).convert("RGB")
    if current.size != baseline.size:
        current = current.resize(baseline.size)
    baseline_hash = difference_hash(baseline)
    current_hash = difference_hash(current)
    hash_distance = sum(a != b for a, b in zip(baseline_hash, current_hash)) / len(baseline_hash)
    mean_error = sum(ImageStat.Stat(ImageChops.difference(baseline, current)).mean) / (3 * 255)
    return round(hash_distance, 6), round(mean_error, 6)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    target = args.target.rstrip("/")
    executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
    if not executable:
        system_chrome = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        if system_chrome.exists():
            executable = str(system_chrome)
        else:
            cache = Path.home() / "Library/Caches/ms-playwright"
            installed = sorted(cache.glob("chromium_headless_shell-*/chrome-mac*/headless_shell"))
            if installed:
                executable = str(installed[-1])
    CAPTURES.mkdir(parents=True, exist_ok=True)
    results = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable)
        for baseline in BASELINES:
            family = baseline["family"]
            viewport = baseline["viewport"]
            width, height = viewport["width"], viewport["height"]
            route = baseline["url"].split(".com", 1)[1]
            page = browser.new_page(viewport={"width": width, "height": height})
            page.emulate_media(reduced_motion="reduce")
            response = page.goto(f"{target}{route}", wait_until="domcontentloaded")
            page.wait_for_timeout(500)
            current_path = CAPTURES / f"{family}-{viewport['name']}-{width}x{height}.png"
            page.screenshot(path=str(current_path), full_page=False)
            geometry = page.evaluate("""
                () => {
                  const rect = (selector) => {
                    const element = document.querySelector(selector);
                    if (!element) return null;
                    const box = element.getBoundingClientRect();
                    return { top: box.top, left: box.left, width: box.width, height: box.height };
                  };
                  const ctas = [...document.querySelectorAll(
                    "[data-source-article='ArtID1'] .TPcta-row .TPcta"
                  )].slice(0, 4).map(element => {
                    const box = element.getBoundingClientRect();
                    return { top: box.top, left: box.left, width: box.width, height: box.height };
                  });
                  return {
                    scrollHeight: document.documentElement.scrollHeight,
                    header: rect('.site-header'),
                    hero: rect('.page-hero--home'),
                    firstHeading: rect('[data-fidelity-root] h1'),
                    ctas,
                    videoId: document.querySelector('.page-hero__video iframe')?.src || '',
                    innerHeroCount: document.querySelectorAll('body:not([data-family="home"]) .page-hero').length,
                  };
                }
            """)
            page.close()

            baseline_path = ROOT / "source-freeze" / baseline["localPath"]
            hash_distance, mean_error = compare_top_viewport(
                baseline_path, current_path, width, height
            )
            height_ratio = geometry["scrollHeight"] / baseline["scrollHeight"]
            checks = {
                "status_200": bool(response and response.status == 200),
                "top_perceptual_shape": hash_distance <= 0.40,
                "top_mean_colour_error": mean_error <= 0.22,
                "page_length_proportion": 0.67 <= height_ratio <= 1.30,
                "no_invented_inner_hero": family in {"home", "location"} or geometry["innerHeroCount"] == 0,
            }
            if family in {"home", "location"}:
                checks.update({
                    "source_video_bound": "fLOLbodJq-o" in geometry["videoId"],
                    "four_source_ctas": len(geometry["ctas"]) == 4,
                    "desktop_ctas_horizontal": viewport["name"] != "desktop" or (
                        len(geometry["ctas"]) == 4
                        and max(item["top"] for item in geometry["ctas"])
                        - min(item["top"] for item in geometry["ctas"]) <= 2
                    ),
                    "mobile_ctas_vertical": viewport["name"] != "mobile" or (
                        len(geometry["ctas"]) == 4
                        and len({round(item["top"]) for item in geometry["ctas"]}) == 4
                    ),
                })
            results.append({
                "family": family,
                "route": route,
                "viewport": viewport["name"],
                "pass": all(checks.values()),
                "checks": checks,
                "difference_hash_distance": hash_distance,
                "mean_colour_error": mean_error,
                "source_scroll_height": baseline["scrollHeight"],
                "rendered_scroll_height": geometry["scrollHeight"],
                "height_ratio": round(height_ratio, 4),
                "capture": str(current_path.relative_to(ROOT)),
            })
        browser.close()

    receipt = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": target,
        "contract": {
            "difference_hash_max": 0.40,
            "mean_colour_error_max": 0.22,
            "page_length_ratio": [0.67, 1.30],
            "note": "Thresholds reject the former generic redesign while allowing browser font rasterisation differences.",
        },
        "checks": len(results),
        "passed": sum(item["pass"] for item in results),
        "failed": sum(not item["pass"] for item in results),
        "results": results,
    }
    OUT.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("target", "checks", "passed", "failed")}, indent=2))
    raise SystemExit(1 if receipt["failed"] else 0)


if __name__ == "__main__":
    main()
