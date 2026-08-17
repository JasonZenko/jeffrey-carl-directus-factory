#!/usr/bin/env python3
"""Build isolated presentation and utility migration arms from one frozen capture."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parent
FREEZE = ROOT / "source-freeze"
MANIFESTS = FREEZE / "manifests"
OUTPUTS = ROOT / "outputs"


def clean(value: str) -> str:
    return " ".join((value or "").replace("\xa0", " ").split())


def slug_for(url: str) -> str:
    path = urlparse(url).path.strip("/") or "home"
    tail = path.rsplit("/", 1)[-1]
    tail = re.sub(r"\.asp$", "", tail, flags=re.I)
    tail = re.sub(r"[^a-zA-Z0-9]+", "-", tail).strip("-").lower()
    return tail or "home"


def content_root(soup: BeautifulSoup) -> Tag:
    root = soup.select_one(".TPart1Col") or soup.select_one(".TPart1Band")
    if not root:
        # Three newer legacy layouts omit the standard TPart wrapper. Select
        # the largest non-footer content div from the immutable HTML only.
        candidates = [
            node for node in soup.find_all("div")
            if "TPcopyright" not in (node.get("class") or [])
            and len(clean(node.get_text(" ", strip=True))) >= 200
        ]
        root = max(candidates, key=lambda node: len(clean(node.get_text(" ", strip=True))), default=None)
    if not root:
        raise ValueError("No frozen primary-content container")
    return root


def ordered_regions(root: Tag) -> list[dict]:
    """Extract conservative, ordered authoring regions without source mutation."""
    regions: list[dict] = []
    current = {"heading": "", "html": [], "text": [], "links": [], "images": []}

    def flush() -> None:
        nonlocal current
        text = clean(" ".join(current["text"]))
        if current["heading"] or text or current["links"] or current["images"]:
            current["body_html"] = "\n".join(current.pop("html"))
            current["text"] = text
            regions.append(current)
        current = {"heading": "", "html": [], "text": [], "links": [], "images": []}

    for node in root.find_all(["h1", "h2", "h3", "h4", "p", "ul", "ol", "table", "img"], recursive=True):
        if node.find_parent(["p", "ul", "ol", "table"]) and node.name not in {"img"}:
            continue
        if node.name in {"h1", "h2", "h3", "h4"}:
            heading = clean(node.get_text(" ", strip=True))
            if heading:
                flush(); current["heading"] = heading
            continue
        if node.name == "img":
            src = node.get("src") or node.get("data-src")
            if src and src not in current["images"]:
                current["images"].append(src)
            continue
        text = clean(node.get_text(" ", strip=True))
        if text:
            current["text"].append(text)
            current["html"].append(str(node))
        for link in node.select("a[href]"):
            label, href = clean(link.get_text(" ", strip=True)), link.get("href")
            if label and href:
                current["links"].append({"label": label, "url": href})
        for image in node.select("img"):
            src = image.get("src") or image.get("data-src")
            if src and src not in current["images"]:
                current["images"].append(src)
    flush()
    if not regions:
        regions.append({
            "heading": "", "body_html": str(root),
            "text": clean(root.get_text(" ", strip=True)),
            "links": [{"label": clean(a.get_text(" ", strip=True)), "url": a.get("href")} for a in root.select("a[href]") if clean(a.get_text(" ", strip=True))],
            "images": [src for img in root.select("img") if (src := (img.get("src") or img.get("data-src")))]
        })
    return regions


def hero(title: str, intro: str = "") -> dict:
    return {"type": "inner_hero_standard", "item": {"page_title": title, "intro_paragraph": intro}}


def flex(region: dict) -> dict:
    return {"type": "flex_content_section", "item": {"section_header": region["heading"], "body_content": region["body_html"], "plain_text": region["text"], "links": region["links"], "images": region["images"]}}


def build_utility(page: dict, title: str, regions: list[dict]) -> list[dict]:
    if page["templateFamily"] == "home":
        intro = regions[0]["text"] if regions else ""
        return [{"type": "home_hero", "item": {"page_title": title, "intro_paragraph": intro}}] + [flex(r) for r in regions[1:]]
    intro = regions[0]["text"] if regions and not regions[0]["heading"] else ""
    remainder = regions[1:] if intro else regions
    return [hero(title, intro)] + [flex(r) for r in remainder]


def build_presentation(page: dict, title: str, regions: list[dict]) -> list[dict]:
    blocks = build_utility(page, title, regions)
    family, url = page["templateFamily"], page["sitemapUrl"].lower()
    if family == "conversion" and "contact-us" in url:
        text = clean(" ".join(r["text"] for r in regions))
        blocks = [hero(title), {"type": "contact_info_standard", "item": {"source_text": text, "links": [x for r in regions for x in r["links"]]}}]
    elif "links-of-interest" in url:
        links = [x for r in regions for x in r["links"]]
        blocks = [hero(title), {"type": "highlight_links", "item": {"section_heading": "Links of Interest", "links": links}}]
    elif "office-tour" in url:
        images = [x for r in regions for x in r["images"]]
        blocks = [hero(title), {"type": "image_gallery", "item": {"section_heading": "Office Tour", "images": images}}]
    return blocks


def arm_record(mode: str, pages: list[dict], freeze_hash: str) -> dict:
    inner = [p for p in pages if p["family"] != "home"]
    content_ok = sum(bool(p["blocks"]) and p["source_content_present"] for p in pages)
    exception_routes = [p["source_url"] for p in pages if p["exceptions"]]
    return {
        "mode": mode,
        "arm_label": "presentation" if mode == "normal" else "utility",
        "source_freeze_sha256": freeze_hash,
        "page_count": len(pages),
        "content_checks_passed": content_ok,
        "content_checks_total": len(pages),
        "visual_sample_pages": 8,
        "visual_sample_completed": 0,
        "human_correction_minutes": 0,
        "human_correction_measured": False,
        "route_count": len(pages),
        "inner_page_count": len(inner),
        "block_count": sum(len(p["blocks"]) for p in pages),
        "exception_count": sum(len(p["exceptions"]) for p in pages),
        "exception_routes": exception_routes,
        "limitations": ["No browser render or human correction pass has been performed; correction minutes are an unmeasured schema placeholder, not a timing result."]
    }


def main() -> None:
    receipt = json.loads((ROOT / "source-freeze-receipt.json").read_text())
    freeze_hash = receipt["source_freeze_sha256"]
    source_pages = json.loads((MANIFESTS / "pages.json").read_text())
    arms = {"presentation": [], "utility": []}
    for source in source_pages:
        local = FREEZE / source["localPath"]
        if hashlib.sha256(local.read_bytes()).hexdigest() != source["sha256"]:
            raise RuntimeError(f"Frozen page hash mismatch: {local}")
        soup = BeautifulSoup(local.read_text(errors="replace"), "html.parser")
        root = content_root(soup); regions = ordered_regions(root)
        title_node = root.find(["h1", "h2"])
        title = clean(title_node.get_text(" ", strip=True) if title_node else source["title"].split(" - ")[0])
        meaningful = any(r["text"] or r["links"] or r["images"] for r in regions)
        common = {"slug": slug_for(source["sitemapUrl"]), "source_url": source["sitemapUrl"], "source_html_sha256": source["sha256"], "source_freeze_sha256": freeze_hash, "family": source["templateFamily"], "title": title, "source_region_count": len(regions), "source_region_text": [r["text"] for r in regions], "source_content_present": meaningful, "exceptions": [] if meaningful else ["frozen primary-content wrapper contains no meaningful prose, links or images"]}
        arms["utility"].append({**common, "blocks": build_utility(source, title, regions)})
        arms["presentation"].append({**common, "blocks": build_presentation(source, title, regions)})
    OUTPUTS.mkdir(exist_ok=True)
    for name, pages in arms.items():
        (OUTPUTS / f"{name}-pages.json").write_text(json.dumps(pages, indent=2) + "\n")
    comparison = {
        "schema_version": "1.0.0", "source_freeze_sha256": freeze_hash, "production_mutated": False,
        "arms": [arm_record("normal", arms["presentation"], freeze_hash), arm_record("utility", arms["utility"], freeze_hash)],
        "jeffrey_regression": {"strict_passed": 78, "strict_total": 78, "browser_passed": 18, "browser_total": 18, "visual_passed": 18, "visual_total": 18, "status": "carried forward from current validated Jeffrey evidence; not rerun by this isolated builder"},
        "recommendation": "Use utility mode as the low-risk fidelity baseline for inner pages; use presentation classification only where a dedicated component is supported by unambiguous source evidence.",
        "limitations": ["This comparison validates deterministic structure and frozen-source coverage, not rendered visual parity.", "The eight-page visual sample is planned but zero pages were captured in this isolated build.", "Human correction time remains unmeasured; the numeric zero is a schema placeholder, not a result.", "Two sitemap routes ending p74763 and p75864 return HTTP 200 but their frozen primary-content wrappers contain no meaningful prose, links or images; both are explicit exceptions in each arm."]
    }
    (OUTPUTS / "director-comparison.json").write_text(json.dumps(comparison, indent=2) + "\n")
    print(json.dumps({"freeze": freeze_hash, "routes": len(source_pages), "outputs": str(OUTPUTS)}, indent=2))


if __name__ == "__main__":
    main()
