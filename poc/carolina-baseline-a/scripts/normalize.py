#!/usr/bin/env python3
"""Normalize the frozen Carolina estate into Pearl-safe structured content."""

from __future__ import annotations

import html
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[1]
FREEZE = ROOT / "source-freeze"
OUT = ROOT / "migration"
SOURCE_HOSTS = {"carolinacomfortdental.com", "www.carolinacomfortdental.com"}
BLOCK_TAGS = {"h2", "h3", "h4", "p", "ul", "ol", "blockquote", "table"}
ALLOWED_TAGS = {"p", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "b", "em", "i", "a", "br", "table", "thead", "tbody", "tr", "th", "td"}


def normalize_url(value: str) -> str:
    parsed = urlparse(value)
    return urlunparse(((parsed.scheme or "https").lower(), (parsed.netloc or "").lower(), parsed.path or "/", "", parsed.query, ""))


def slug_for_url(value: str) -> str:
    path = urlparse(value).path.strip("/")
    if not path:
        return "home"
    return re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-")


def words(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+(?:['’][a-z0-9]+)?", value.lower())


def clean_text(value: str) -> str:
    return " ".join(value.split())


def rewrite_href(value: str, page_url: str, slug_by_url: dict[str, str]) -> str:
    if not value or value.startswith(("#", "mailto:", "tel:")):
        return value
    absolute = normalize_url(urljoin(page_url, value))
    host = (urlparse(absolute).hostname or "").lower()
    if host in SOURCE_HOSTS:
        target = slug_by_url.get(absolute)
        if target:
            return "/" if target == "home" else f"/template-preview/pearl/{target}/"
    return absolute


def sanitize_fragment(node: Tag, page_url: str, slug_by_url: dict[str, str]) -> str:
    fragment = BeautifulSoup(str(node), "html.parser")
    for bad in fragment.find_all(["script", "style", "noscript", "iframe", "form", "img", "svg"]):
        bad.decompose()
    for tag in list(fragment.find_all(True)):
        if tag.name not in ALLOWED_TAGS:
            tag.unwrap()
            continue
        attrs = {}
        if tag.name == "a" and tag.get("href"):
            attrs["href"] = rewrite_href(tag["href"], page_url, slug_by_url)
        tag.attrs = attrs
    return clean_text(str(fragment))


def real_image_url(node: Tag, page_url: str) -> str | None:
    for attr in ("nitro-lazy-src", "data-lazy-src", "data-src", "src"):
        value = node.get(attr)
        if value and not value.startswith("data:"):
            return normalize_url(urljoin(page_url, value))
    return None


def unique_semantic_units(main: Tag, page_url: str, slug_by_url: dict[str, str]) -> list[dict]:
    units = []
    seen = set()
    for node in main.find_all(BLOCK_TAGS):
        if any(parent.name in BLOCK_TAGS for parent in node.parents if parent is not main):
            continue
        if node.find_parent(["header", "footer", "nav", "form"]):
            continue
        text = clean_text(node.get_text(" ", strip=True))
        key = re.sub(r"\W+", " ", text.lower()).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        fragment = sanitize_fragment(node, page_url, slug_by_url)
        if fragment:
            units.append({"tag": node.name, "text": text, "html": fragment})
    for node in main.find_all("a"):
        if node.find_parent(["p", "li", "h2", "h3", "h4", "nav", "form"]):
            continue
        text = clean_text(node.get_text(" ", strip=True))
        if not text or not re.search(r"appointment|schedule|contact|call|learn|view|see|meet", text, re.I):
            continue
        key = re.sub(r"\W+", " ", text.lower()).strip()
        if key in seen:
            continue
        seen.add(key)
        href = rewrite_href(node.get("href", "#"), page_url, slug_by_url)
        units.append({"tag": "p", "text": text, "html": f'<p><a href="{html.escape(href, quote=True)}">{html.escape(text)}</a></p>'})
    return units


def split_sections(units: list[dict]) -> tuple[list[dict], list[dict]]:
    intro = []
    sections = []
    current = None
    for unit in units:
        if unit["tag"] == "h2":
            current = {"heading": unit["text"], "body_html": "", "source_units": 0}
            sections.append(current)
            continue
        if current is None:
            intro.append(unit)
        else:
            current["body_html"] += unit["html"]
            current["source_units"] += 1
    sections = [section for section in sections if clean_text(BeautifulSoup(section["body_html"], "html.parser").get_text(" ", strip=True))]
    return intro, sections


def collect_images(main: Tag, page_url: str, asset_by_url: dict[str, dict]) -> list[dict]:
    images = []
    seen = set()
    candidates = []
    for node in main.find_all("img"):
        url = real_image_url(node, page_url)
        if url:
            candidates.append((url, clean_text(node.get("alt", "")), "img"))
    for node in main.select("[nitro-lazy-bg]"):
        url = normalize_url(urljoin(page_url, node.get("nitro-lazy-bg")))
        candidates.append((url, clean_text(node.get("title", "")), "background"))
    for url, alt, role in candidates:
        if url in seen:
            continue
        seen.add(url)
        asset = asset_by_url.get(url)
        if not asset:
            images.append({"source_url": url, "alt": alt, "role": role, "missing_asset": True})
            continue
        if not (asset.get("contentType") or "").startswith("image/"):
            continue
        images.append({
            "source_url": url,
            "alt": alt,
            "role": role,
            "local_path": asset["localPath"],
            "sha256": asset["sha256"],
            "content_type": asset["contentType"],
        })
    return images


def first_matching(items: list[dict], pattern: str, fallback: int = 0) -> dict | None:
    for item in items:
        if re.search(pattern, f'{item.get("alt", "")} {item.get("source_url", "")}', re.I):
            return item
    return items[fallback] if items else None


pages = json.loads((FREEZE / "manifests/pages.json").read_text())
assets = json.loads((FREEZE / "manifests/assets.json").read_text())
asset_by_url = {normalize_url(item["url"]): item for item in assets}
slug_by_url = {normalize_url(page["sitemapUrl"]): slug_for_url(page["sitemapUrl"]) for page in pages}

normalized_pages = []
exceptions = []
for page in pages:
    page_url = normalize_url(page["sitemapUrl"])
    soup = BeautifulSoup((FREEZE / page["localPath"]).read_bytes(), "html.parser")
    main = soup.select_one("main") or soup.body
    for bad in main.find_all(["script", "style", "noscript"]):
        bad.decompose()
    h1 = clean_text((main.find("h1") or soup.find("h1") or {}).get_text(" ", strip=True)) if (main.find("h1") or soup.find("h1")) else page["title"]
    units = unique_semantic_units(main, page_url, slug_by_url)
    intro_units, sections = split_sections(units)
    intro_html = "".join(unit["html"] for unit in intro_units[:4])
    if not clean_text(BeautifulSoup(intro_html, "html.parser").get_text(" ", strip=True)) and page.get("metaDescription"):
        intro_html = f'<p>{html.escape(page["metaDescription"])}</p>'
    images = collect_images(main, page_url, asset_by_url)
    source_text = clean_text(main.get_text(" ", strip=True))
    mapped_text = clean_text(" ".join(unit["text"] for unit in units))
    source_counts = Counter(words(source_text))
    mapped_counts = Counter(words(mapped_text))
    matched = sum(min(count, mapped_counts[token]) for token, count in source_counts.items())
    coverage = round(matched / max(1, sum(source_counts.values())), 4)
    forms = len(main.find_all("form"))
    iframes = [normalize_url(urljoin(page_url, node.get("src"))) for node in main.find_all("iframe") if node.get("src")]
    missing_images = [image["source_url"] for image in images if image.get("missing_asset")]
    if forms:
        exceptions.append({"slug": slug_by_url[page_url], "type": "interactive_form", "count": forms, "disposition": "production-hardening"})
    if iframes:
        exceptions.append({"slug": slug_by_url[page_url], "type": "iframe", "urls": iframes, "disposition": "component-or-provider-review"})
    if missing_images:
        exceptions.append({"slug": slug_by_url[page_url], "type": "missing_media", "urls": missing_images, "disposition": "source-retry"})
    testimonials = []
    for quote in main.select("p.quote-heading"):
        value = clean_text(quote.get_text(" ", strip=True))
        if value and value not in [item["quote"] for item in testimonials]:
            holder = quote.find_parent(class_="qhldr")
            candidate = holder.select_one(".qsig p") if holder else None
            attribution = clean_text(candidate.get_text(" ", strip=True)) if candidate else ""
            testimonials.append({"quote": value, "attribution": attribution})
    cta = None
    for anchor in main.find_all("a", href=True):
        label = clean_text(anchor.get_text(" ", strip=True))
        if re.search(r"request|schedule|reserve|appointment", label, re.I):
            cta = {"label": label, "url": rewrite_href(anchor["href"], page_url, slug_by_url)}
            break
    hero_primary = main.select_one(".hero-text-wrap .heading-primary")
    hero_secondary = main.select_one(".hero-text-wrap .heading-hero")
    hero_supporting = main.select_one(".hero-text-wrap .heading-tertiary")
    hero_heading = clean_text(" ".join(filter(None, [
        hero_primary.get_text(" ", strip=True) if hero_primary else "",
        hero_secondary.get_text(" ", strip=True) if hero_secondary else "",
    ])))
    normalized_pages.append({
        "source_url": page_url,
        "source_sha256": page["sha256"],
        "slug": slug_by_url[page_url],
        "title": page["title"],
        "meta_description": page.get("metaDescription") or "",
        "h1": h1,
        "hero_heading": hero_heading or h1,
        "hero_supporting": clean_text(hero_supporting.get_text(" ", strip=True)) if hero_supporting else "",
        "intro_html": intro_html,
        "sections": sections,
        "images": images,
        "hero_image": first_matching(images, r"hero|staff|team|dentist|patient"),
        "doctor_image": first_matching(images, r"dr[.-]?nguyen|doctor|headshot"),
        "testimonials": testimonials,
        "cta": cta,
        "template_family": page["templateFamily"],
        "source_visible_words": sum(source_counts.values()),
        "mapped_semantic_words": sum(mapped_counts.values()),
        "multiset_word_coverage": coverage,
        "semantic_units": len(units),
        "forms": forms,
        "iframes": iframes,
    })

home = next(page for page in normalized_pages if page["slug"] == "home")
service_pages = [page for page in normalized_pages if "/services/" in page["source_url"] and page["slug"] != "services"]
receipt = {
    "baseline": "A",
    "source": "https://www.carolinacomfortdental.com/",
    "source_pages": len(normalized_pages),
    "source_http_200": sum(page["status"] == 200 for page in pages),
    "frozen_assets": len(assets),
    "frozen_asset_bytes": sum(item["bytes"] for item in assets),
    "homepage_contract": [
        "pearl_main_hero_standard", "pearl_icon_feature_cards", "pearl_feature_image_content",
        "pearl_icon_feature_cards", "pearl_highlight_snippet_quote", "pearl_feature_image_content",
        "pearl_contact_info_standard",
    ],
    "inner_page_strategy": "Inner Hero Standard plus one or more source-derived Flex Content Sections; specialist official blocks are added only when source evidence supports them.",
    "pages_with_images": sum(bool(page["images"]) for page in normalized_pages),
    "service_pages": len(service_pages),
    "median_word_coverage": sorted(page["multiset_word_coverage"] for page in normalized_pages)[len(normalized_pages) // 2],
    "minimum_word_coverage": min(page["multiset_word_coverage"] for page in normalized_pages),
    "exceptions": len(exceptions),
    "home_testimonials": len(home["testimonials"]),
}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "normalized-pages.json").write_text(json.dumps(normalized_pages, indent=2))
(OUT / "exceptions.json").write_text(json.dumps(exceptions, indent=2))
(OUT / "mapping-receipt.json").write_text(json.dumps(receipt, indent=2))
print(json.dumps(receipt, indent=2))
