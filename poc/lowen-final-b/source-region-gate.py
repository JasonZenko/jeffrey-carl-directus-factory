#!/usr/bin/env python3
"""Fail-closed source-region fidelity gate for the final Lowen B pass.

This gate is intentionally independent of the mapper. It compares the frozen
source estate with the generated migration objects by identity, not merely by
aggregate counts: visible copy, headings, links, managed images and hashes,
lists, tables, embeds, forms and page metadata. Every ArtID source region is
also inventoried in the machine receipt so omissions cannot hide inside a
page-level total.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
POC = HERE.parent
BASELINE = POC / "lowen-baseline-a"
FREEZE = BASELINE / "source-freeze"
MIGRATION = BASELINE / "migration"
RECEIPT = HERE / "receipts/source-region-fidelity.json"
TOKEN = re.compile(r"[a-z0-9]+(?:['’][a-z0-9]+)?", re.I)


def normalized_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def tokens(value: str) -> list[str]:
    return [item.lower() for item in TOKEN.findall(value)]


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def clean_soup(value: str) -> BeautifulSoup:
    soup = BeautifulSoup(value, "html.parser")
    for node in soup.select("script,style,noscript,template,svg,[style*='display:none'],[style*='display: none']"):
        node.decompose()
    return soup


def visible(value: str | None) -> str:
    return normalized_text(clean_soup(value or "").get_text(" ", strip=True))


def block_visible_strings(block: dict) -> list[str]:
    item, kind = block["item"], block["type"]
    fields: list[str | None] = []
    if kind == "main_hero_standard":
        fields = [item.get("heading"), item.get("supporting_text"), item.get("primary_cta_label")]
    elif kind == "inner_hero_standard":
        fields = [item.get("page_title"), item.get("intro_paragraph"), item.get("cta_label")]
    elif kind == "flex_content_section":
        fields = [item.get("section_header"), item.get("body_content")]
    elif kind == "feature_image_content":
        fields = [item.get("heading"), item.get("body"), item.get("cta_label")]
    elif kind == "cta_section_standard":
        fields = [item.get("heading"), item.get("body"), item.get("cta_label")]
    elif kind == "contact_info_standard":
        fields = ["Location:", item.get("address"), item.get("heading"), "Phone:", item.get("phone"), "Email:", item.get("email")]
    elif kind == "icon_feature_cards":
        fields = [item.get("section_heading"), item.get("intro_text")]
        for child in item.get("items") or []:
            fields.extend([child.get("title"), child.get("body")])
    elif kind == "highlight_links":
        fields = [item.get("section_heading")]
        for child in item.get("links") or []:
            fields.append(child.get("link_label"))
    elif kind in {"highlight_snippet_quote", "highlight_quote"}:
        fields = [item.get("snippet"), item.get("quote"), item.get("attribution")]
    elif kind == "testimonial_list_standard":
        fields = [item.get("section_heading"), item.get("intro_text")]
        for child in item.get("reviews") or []:
            fields.extend([child.get("quote"), child.get("patient_name"), child.get("author"), child.get("role")])
    else:
        raise ValueError(f"unhandled visible-field contract for {kind}")
    return [visible(value) for value in fields if visible(value)]


def walk_strings(value, wanted: set[str], key: str = ""):
    if isinstance(value, dict):
        for child_key, child in value.items():
            yield from walk_strings(child, wanted, child_key)
    elif isinstance(value, list):
        for child in value:
            yield from walk_strings(child, wanted, key)
    elif isinstance(value, str) and key in wanted:
        yield value


def rich_html_values(block: dict) -> list[str]:
    return list(walk_strings(block["item"], {"body", "body_content", "intro_paragraph", "quote"}))


def output_urls(block: dict) -> list[str]:
    result = list(walk_strings(block["item"], {"url", "link_url", "cta_url", "primary_cta_url"}))
    if block["type"] == "contact_info_standard" and block["item"].get("email"):
        result.append(f"mailto:{block['item']['email']}")
    for value in rich_html_values(block):
        result.extend(anchor["href"] for anchor in BeautifulSoup(value, "html.parser").select("a[href]"))
    return [value for value in result if value]


def output_assets(block: dict) -> list[tuple[str, str, str]]:
    assets = []

    def visit(value):
        if isinstance(value, dict):
            if value.get("source_url", "").startswith(("http://", "https://")) and value.get("sha256"):
                assets.append((value["source_url"], normalized_text(value.get("alt")), value["sha256"]))
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(block["item"])
    return assets


def html_structures(values: list[str], selector: str) -> list[dict]:
    result = []
    for value in values:
        soup = BeautifulSoup(value, "html.parser")
        for node in soup.select(selector):
            if node.name in {"ul", "ol"}:
                result.append({"kind": node.name, "items": [normalized_text(li.get_text(" ", strip=True)) for li in node.find_all("li", recursive=False)]})
            elif node.name == "table":
                result.append({"kind": "table", "rows": [[normalized_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"], recursive=False)] for row in node.select("tr")]})
    return result


def semantic_headings(block: dict) -> list[tuple[str, str]]:
    item, kind = block["item"], block["type"]
    result: list[tuple[str, str]] = []
    if kind in {"main_hero_standard", "inner_hero_standard"}:
        result.append(("h1", normalized_text(item.get("heading") or item.get("page_title"))))
    elif kind == "flex_content_section" and item.get("section_header"):
        result.append((item.get("header_tag") or "h2", normalized_text(item["section_header"])))
    elif kind in {"feature_image_content", "cta_section_standard"} and item.get("heading"):
        result.append(("h2", normalized_text(item["heading"])))
    elif kind == "contact_info_standard":
        result.append(("h2", "Location:"))
        if item.get("heading"):
            result.append(("h2", normalized_text(item["heading"])))
    elif kind == "icon_feature_cards":
        if item.get("section_heading"):
            result.append(("h2", normalized_text(item["section_heading"])))
        result.extend(("h3", normalized_text(child.get("title"))) for child in item.get("items") or [] if child.get("title"))
    elif kind == "testimonial_list_standard" and item.get("section_heading"):
        result.append(("h2", normalized_text(item["section_heading"])))
    elif kind == "highlight_links" and item.get("section_heading"):
        result.append(("h2", normalized_text(item["section_heading"])))
    if kind == "testimonial_list_standard":
        result.extend(("h3", normalized_text(child.get("patient_name"))) for child in item.get("reviews") or [] if child.get("patient_name"))
    if kind in {"highlight_snippet_quote", "highlight_quote"} and item.get("snippet"):
        result.append(("h2", normalized_text(item["snippet"])))
    for value in rich_html_values(block):
        soup = BeautifulSoup(value, "html.parser")
        result.extend((node.name, normalized_text(node.get_text(" ", strip=True))) for node in soup.find_all(re.compile(r"^h[1-6]$")))
    return [item for item in result if item[1]]


manifest = json.loads((FREEZE / "manifests/pages.json").read_text())
assets_manifest = json.loads((FREEZE / "manifests/assets.json").read_text())
pages = json.loads((MIGRATION / "pages.json").read_text())
site = json.loads((MIGRATION / "site.json").read_text())
exceptions = json.loads((MIGRATION / "exceptions.json").read_text())
source_by_hash = {item["sha256"]: item for item in manifest}
asset_hashes = {item["url"]: item["sha256"] for item in assets_manifest}
css_records = [item for item in assets_manifest if "/webpage.css" in item["url"]]
source_css = "\n".join((FREEZE / item["localPath"]).read_text(encoding="utf-8", errors="ignore") for item in css_records)
route_to_slug = {}
static_asset_to_source = {
    f"/lowen-assets/{item['sha256'][:12]}-{Path(urlparse(item['url']).path).name}": item["url"]
    for item in assets_manifest
    if item.get("contentType") == "application/pdf"
}
for page in pages:
    source = source_by_hash[page["source_html_sha256"]]
    route_to_slug[urlparse(source["finalUrl"]).path] = page["slug"]
    route_to_slug[urlparse(source["sitemapUrl"]).path] = page["slug"]
    route_to_slug[f"/{page['slug']}/"] = page["slug"]


def canonical_url(value: str, base: str) -> str:
    value = normalized_text(value)
    if value.lower().startswith("http:// https://"):
        value = value[len("http:// "):]
    absolute = urljoin(base, value)
    parsed = urlparse(absolute)
    if parsed.path in static_asset_to_source:
        return static_asset_to_source[parsed.path]
    slug = route_to_slug.get(parsed.path)
    if slug:
        return "/" if slug == "home" else f"/{slug}/"
    return absolute


errors: list[str] = []
page_ledger = []
all_regions = []

for page in pages:
    source = source_by_hash[page["source_html_sha256"]]
    source_html = (FREEZE / source["localPath"]).read_text(encoding="utf-8")
    raw_source_soup = BeautifulSoup(source_html, "html.parser")
    source_soup = clean_soup(source_html)
    regions = source_soup.select("[id^='ArtID']")
    hero = source_soup.select_one(".TPaniBannerBand") if page["slug"] == "home" else None
    output_blocks = page["blocks"]
    source_text_parts = [normalized_text(region.get_text(" ", strip=True)) for region in regions]
    source_text_parts.extend(normalized_text(image.get("alt")) for image in raw_source_soup.select("[id^='ArtID'] .TPsocial a[href] img[alt]") if normalized_text(image.get("alt")))
    source_text_parts.extend(normalized_text(title.get_text(" ", strip=True)) for title in raw_source_soup.select("[id^='ArtID'] .TPsocial a[href] svg title") if normalized_text(title.get_text(" ", strip=True)))
    if hero:
        source_text_parts.append(normalized_text(hero.get_text(" ", strip=True)))
    source_text = " ".join(source_text_parts)
    output_text = " ".join(value for block in output_blocks for value in block_visible_strings(block))
    source_words, output_words = Counter(tokens(source_text)), Counter(tokens(output_text))

    source_links = [canonical_url(anchor["href"], page["source_url"]) for region in regions for anchor in region.select("a[href]")]
    if hero:
        source_links.extend(canonical_url(anchor["href"], page["source_url"]) for anchor in hero.select("a[href]"))
    mapped_links = [canonical_url(value, page["source_url"]) for block in output_blocks for value in output_urls(block)]

    source_assets = []
    for region in regions:
        for image in region.select("img[src]"):
            source_url = urljoin(page["source_url"], image["src"])
            source_assets.append((source_url, normalized_text(image.get("alt")), asset_hashes.get(source_url, "")))
        ancestor_classes = [class_name for ancestor in region.parents for class_name in (ancestor.get("class") or [])]
        for class_name in ancestor_classes:
            match = re.search(rf"\.{re.escape(class_name)}\s*\{{[^}}]*background-image\s*:\s*url\((['\"]?)([^)'\"]+)\1\)", source_css, re.I)
            if not match:
                continue
            background_url = urljoin(page["source_url"], match.group(2).strip())
            if background_url in asset_hashes:
                source_assets.append((background_url, "Portland skyline", asset_hashes[background_url]))
    if hero:
        hero_asset = next((item for item in assets_manifest if "bkg-anibanner" in item["url"].lower() or "bkg-slider1" in item["url"].lower()), None)
        if hero_asset:
            source_assets.append((hero_asset["url"], "", hero_asset["sha256"]))
    mapped_assets = [item for block in output_blocks for item in output_assets(block)]

    source_structure_values = [
        str(node)
        for region in regions
        for node in region.select("ul,ol,table")
        if not node.find_parent(["form", "iframe", "embed"])
    ]
    source_structures = html_structures(source_structure_values, "ul,ol,table")
    mapped_structures = html_structures([value for block in output_blocks for value in rich_html_values(block)], "ul,ol,table")
    source_headings = []
    heading_nodes = [node for region in regions for node in region.find_all(re.compile(r"^h[1-6]$"))]
    if hero:
        heading_nodes.extend(hero.find_all(re.compile(r"^h[1-6]$")))
    for node in heading_nodes:
        copy = BeautifulSoup(str(node), "html.parser")
        for nested in copy.select(".TPsubtitle"):
            nested.decompose()
        text_value = normalized_text(copy.get_text(" ", strip=True))
        if text_value:
            source_headings.append((node.name, text_value))
    mapped_headings = [item for block in output_blocks for item in semantic_headings(block)]

    missing_words = source_words - output_words
    added_words = output_words - source_words
    missing_links = Counter(source_links) - Counter(mapped_links)
    added_links = Counter(mapped_links) - Counter(source_links)
    missing_assets = Counter(source_assets) - Counter(mapped_assets)
    added_assets = Counter(mapped_assets) - Counter(source_assets)
    missing_headings = Counter(source_headings) - Counter(mapped_headings)
    semantic_promotions = Counter(mapped_headings) - Counter(source_headings)
    unsupported_promotions = Counter({item: count for item, count in semantic_promotions.items() if normalized_text(item[1]).lower() not in source_text.lower()})

    checks = {
        "copy_exact": not missing_words and not added_words,
        "links_exact": not missing_links and not added_links,
        "managed_images_exact": not missing_assets and not added_assets,
        "lists_and_tables_exact": source_structures == mapped_structures,
        "source_headings_preserved_at_level": not missing_headings,
        "semantic_promotions_source_backed": not unsupported_promotions,
        "title_exact": normalized_text(page["title"]) == normalized_text(source["title"]),
        "meta_description_exact": normalized_text(page.get("meta_description")) == normalized_text(source.get("metaDescription")),
    }
    if not all(checks.values()):
        errors.append(f"{page['slug']}: " + ", ".join(key for key, passed in checks.items() if not passed))

    region_entries = []
    for ordinal, region in enumerate(regions, 1):
        region_html = str(region)
        region_entry = {
            "region_id": region.get("id") or f"ArtID-{ordinal}",
            "ordinal": ordinal,
            "sha256": sha256(region_html),
            "words": len(tokens(normalized_text(region.get_text(" ", strip=True)))),
            "headings": [(node.name, normalized_text(node.get_text(" ", strip=True))) for node in region.find_all(re.compile(r"^h[1-6]$"))],
            "links": [canonical_url(anchor["href"], page["source_url"]) for anchor in region.select("a[href]")],
            "images": [(urljoin(page["source_url"], image["src"]), normalized_text(image.get("alt"))) for image in region.select("img[src]")],
            "lists": len(region.select("ul,ol")),
            "tables": len(region.select("table")),
            "embeds": [urljoin(page["source_url"], node.get("src")) for node in region.select("iframe[src],embed[src]")],
            "forms": len(region.select("form")),
        }
        region_entries.append(region_entry)
        all_regions.append({"slug": page["slug"], **region_entry})

    page_ledger.append({
        "slug": page["slug"],
        "source_html_sha256": page["source_html_sha256"],
        "checks": checks,
        "source_regions": region_entries,
        "mapped_block_types": [block["type"] for block in output_blocks],
        "copy": {"source_tokens": sum(source_words.values()), "mapped_tokens": sum(output_words.values()), "source_counter": dict(source_words), "mapped_counter": dict(output_words), "missing": dict(missing_words), "added": dict(added_words)},
        "links": {"source": source_links, "mapped": mapped_links, "missing": dict(missing_links), "added": dict(added_links)},
        "assets": {"source": source_assets, "mapped": mapped_assets, "missing": [list(item) for item in missing_assets.elements()], "added": [list(item) for item in added_assets.elements()]},
        "headings": {"source": source_headings, "mapped": mapped_headings, "missing": [list(item) for item in missing_headings.elements()], "source_backed_promotions": [list(item) for item in semantic_promotions.elements()]},
        "structures": {"source": source_structures, "mapped": mapped_structures},
    })

source_provider_regions = []
for page_entry in page_ledger:
    for region in page_entry["source_regions"]:
        source_provider_regions.extend({"page": page_entry["slug"], "kind": "embed", "url": url} for url in region["embeds"])
        source_provider_regions.extend({"page": page_entry["slug"], "kind": "form", "url": ""} for _ in range(region["forms"]))
mapped_provider_regions = [{"page": next(page["slug"] for page in pages if page["source_url"] == item["page"]), "kind": item["kind"], "url": item.get("url", "")} for item in exceptions]
provider_checks = {
    "source_count": len(source_provider_regions),
    "mapped_count": len(mapped_provider_regions),
    "exact": Counter((item["page"], item["kind"], item["url"]) for item in source_provider_regions) == Counter((item["page"], item["kind"], item["url"]) for item in mapped_provider_regions),
}
if not provider_checks["exact"]:
    errors.append("provider exceptions do not exactly cover the frozen embeds/forms")

receipt = {
    "ok": not errors,
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "gate": "final-b-source-region-fidelity",
    "frozen_pages": len(manifest),
    "mapped_pages": len(pages),
    "source_regions": len(all_regions),
    "mapped_blocks": sum(len(page["blocks"]) for page in pages),
    "provider_exceptions": provider_checks,
    "navigation": site["navigation"],
    "errors": errors,
    "pages": page_ledger,
}
RECEIPT.parent.mkdir(parents=True, exist_ok=True)
RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({key: value for key, value in receipt.items() if key != "pages"}, indent=2))
raise SystemExit(1 if errors else 0)
