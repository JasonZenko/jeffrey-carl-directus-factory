#!/usr/bin/env python3
"""Map frozen WEO Pearl source objects onto the approved 14-block Pearl contract.

This mapper never starts from a target page skeleton. It walks ordered source
objects, classifies each object, and emits the corresponding Pearl block in the
same order. The Pearl adapter owns presentation; the source owns composition.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import shutil
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, NavigableString, Tag

POC_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = POC_ROOT.parents[1]
FREEZE = POC_ROOT / "source-freeze"
OUT = POC_ROOT / "migration"
GENERATED_ASSETS = OUT / "generated-assets"
ENGINE_PATH = REPO_ROOT / "scripts" / "extract.py"
SOURCE_HOSTS = {"lowenperio.com", "www.lowenperio.com"}
MINIMUM_AUTO_MAP_CONFIDENCE = 0.90

spec = importlib.util.spec_from_file_location("foundry_extract_engine", ENGINE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load extraction engine: {ENGINE_PATH}")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
engine.SOURCE_HOSTS = SOURCE_HOSTS


def normalized_text(value) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\u00ad", "")).strip()


def visible_link_text(node: Tag | None) -> str:
    if node is None:
        return ""
    clone = BeautifulSoup(str(node), "html.parser").find("a")
    if clone is None:
        return ""
    for icon in clone.select("svg,.TPicon"):
        icon.decompose()
    return normalized_text(clone.get_text(" ", strip=True))


def slugify(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.lower())) or "page"


def route_slug(page: dict) -> str:
    if page["templateFamily"] == "home":
        return "home"
    stem = Path(urlparse(page["finalUrl"]).path).stem
    stem = re.sub(r"-p\d+$", "", stem, flags=re.I)
    stem = re.sub(r"^(?:periodontist|periolase|dental-implants?)-(?:tigard|portland)-or-", "", stem, flags=re.I)
    return slugify(stem)


def asset_maps(manifest: list[dict]):
    by_url, by_name = {}, {}
    for item in manifest:
        record = {
            "source_url": item["url"],
            "local_path": item["localPath"],
            "sha256": item["sha256"],
            "content_type": item.get("contentType") or "application/octet-stream",
        }
        by_url[item["url"]] = record
        by_url[item.get("finalUrl", item["url"])] = record
        by_name[Path(item["localPath"]).name] = record
    return by_url, by_name


def source_asset(value: str | None, page_url: str, by_url: dict, by_name: dict, alt: str = ""):
    if not value:
        return None
    absolute = urljoin(page_url, value)
    record = by_url.get(absolute) or by_name.get(Path(urlparse(value).path).name)
    return {**record, "alt": alt} if record else None


def derived_svg(svg: Tag, label: str):
    clone = BeautifulSoup(str(svg), "html.parser").find("svg")
    if clone is None:
        return None
    if not clone.get("xmlns"):
        clone["xmlns"] = "http://www.w3.org/2000/svg"
    payload = str(clone).encode()
    digest = hashlib.sha256(payload).hexdigest()
    GENERATED_ASSETS.mkdir(parents=True, exist_ok=True)
    target = GENERATED_ASSETS / f"{digest[:12]}-{slugify(label)[:60]}.svg"
    target.write_bytes(payload)
    return {
        "source_url": f"inline-svg:{digest}",
        "local_path": str(target.relative_to(POC_ROOT)),
        "sha256": digest,
        "content_type": "image/svg+xml",
        "alt": label,
    }


def remove_nodes(html: str, selectors: str) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    for node in soup.select(selectors):
        node.decompose()
    return "".join(str(node) for node in soup.contents).strip()


def clean_rich_text(html: str) -> str:
    """Remove legacy presentation hooks while preserving semantic source copy."""
    soup = BeautifulSoup(html or "", "html.parser")
    for node in soup.find_all(True):
        if node.name == "a" and node.has_attr("href"):
            candidates = re.findall(r"https?://[^\s]+", node["href"])
            if candidates and (len(candidates) > 1 or re.search(r"\s", node["href"])):
                usable = [candidate for candidate in candidates if candidate not in {"http://", "https://"}]
                if usable:
                    node["href"] = usable[-1]
        classes = [value for value in node.get("class", []) if not value.lower().startswith("tp")]
        if classes:
            node["class"] = classes
        elif node.has_attr("class"):
            del node["class"]
        if str(node.get("id", "")).lower().startswith("tp"):
            del node["id"]
        if str(node.get("title", "")).lower() == "b11":
            del node["title"]
        if node.name in {"div", "span"} and not node.attrs:
            node.unwrap()
    return "".join(str(node) for node in soup.contents).strip()


def mapped_block(block_type: str, item: dict, page: dict, page_url: str, html: str, confidence: float, signals: list[str]) -> dict:
    """Attach auditable source evidence to every automatic mapping decision."""
    return {
        "type": block_type,
        "item": item,
        "mapping": {
            "decision": "auto_map" if confidence >= MINIMUM_AUTO_MAP_CONFIDENCE else "manual_review",
            "confidence": confidence,
            "minimum_auto_map_confidence": MINIMUM_AUTO_MAP_CONFIDENCE,
            "signals": signals,
            "source_url": page_url,
            "source_html_sha256": page["sha256"],
            "fragment_sha256": hashlib.sha256((html or "").encode()).hexdigest(),
        },
    }


def first_link(soup: BeautifulSoup, page_url: str):
    node = soup.find("a", href=True)
    if not node:
        return None
    return {"label": normalized_text(node.get_text(" ", strip=True)), "url": engine.normalize_url(node["href"], page_url)}


def feature_items(segment: list, page_url: str, by_url: dict, by_name: dict):
    soup = BeautifulSoup("".join(str(node) for node in segment), "html.parser")
    items = []
    for index, anchor in enumerate(soup.select("a.TPcta"), 1):
        heading = anchor.find(re.compile(r"^h[1-6]$"))
        title = normalized_text(heading.get_text(" ", strip=True) if heading else anchor.get_text(" ", strip=True))
        icon = None
        image = anchor.find("img")
        if image:
            icon = source_asset(image.get("src"), page_url, by_url, by_name, normalized_text(image.get("alt")))
        if icon is None and anchor.find("svg"):
            icon = derived_svg(anchor.find("svg"), title)
        if icon is None:
            continue
        body = normalized_text(anchor.get("title"))
        items.append({
            "icon": icon,
            "title": title,
            "body": body if body and body != title else "",
            "url": engine.normalize_url(anchor.get("href"), page_url),
            "sort": index,
        })
    return items


def split_band(band: Tag) -> list[list]:
    """Split at stable source-object boundaries, not at target-template slots."""
    # A services grid and a testimonial are each one semantic source object,
    # even though their headings/copy live in sibling nodes around the visual
    # carrier. Keep the complete band together so those values cannot drift
    # into synthetic standalone blocks.
    if band.select_one(".TPctas,.TPquote"):
        return [[child for child in band.children if not isinstance(child, NavigableString) or normalized_text(child)]]

    segments, current = [], []

    def flush():
        nonlocal current
        if current:
            segments.append(current)
            current = []

    for child in band.children:
        if isinstance(child, NavigableString):
            if normalized_text(child):
                current.append(child)
            continue
        if not isinstance(child, Tag):
            continue
        if child.name in {"br", "hr"}:
            # Preserve a semantic word boundary. The legacy source uses BR
            # elements between adjacent text nodes; dropping them concatenated
            # phone numbers, addresses, hours and sentences in rich text.
            current.append(NavigableString(" "))
            continue
        classes = set(child.get("class") or [])
        special = bool(classes & {"TPcta-row", "TPctas", "TPquote"}) or bool(child.select_one(".TPcta-row,.TPctas,.TPquote"))
        profile = "TProw" in classes and child.find(re.compile(r"^h[1-6]$")) and child.find("img")
        form_or_embed = bool(child.find(["form", "iframe", "embed"]))
        if special or profile or form_or_embed:
            flush()
            segments.append([child])
            continue
        if engine.is_heading_carrier(child):
            flush()
        current.append(child)
    flush()
    return segments


def extract_inner_hero(soup: BeautifulSoup, page: dict, page_url: str, by_url: dict, by_name: dict):
    """Separate page identity from page body before semantic classification.

    WEO Pearl inner pages place the title, lead image and complete article body
    inside one ArtID band. Treating that band as the first content region made
    the old mapper collapse the whole article into Inner Hero. The hero owns
    only the page title and lead image; the remaining source nodes stay in the
    band and are classified independently.
    """
    band = soup.select_one("[id^='ArtID']")
    if band is None:
        return None

    title_node = band.select_one(":scope > .TPtitle") or band.find("h1", recursive=False)
    title = normalized_text(title_node.get_text(" ", strip=True)) if title_node else normalized_text(page["h1s"][0] if page.get("h1s") else page["title"])
    title_html = str(title_node) if title_node else title
    if title_node:
        title_node.decompose()

    image_node = band.find("img", recursive=False)
    image = source_asset(
        image_node.get("src"),
        page_url,
        by_url,
        by_name,
        normalized_text(image_node.get("alt")),
    ) if image_node else None
    image_html = str(image_node) if image_node else ""
    if image_node and image:
        image_node.decompose()

    # Direct-child bold labels in the legacy article body are section
    # headings, not inline emphasis. Promote them before segmentation so each
    # source section remains separately editable in Directus.
    for label in band.find_all(["b", "strong"], recursive=False):
        previous = label.previous_sibling
        while isinstance(previous, NavigableString) and not normalized_text(previous):
            previous = previous.previous_sibling
        starts_section = previous is None or (isinstance(previous, Tag) and previous.name in {"br", "hr", "img"})
        if starts_section and normalized_text(label.get_text(" ", strip=True)):
            label.name = "h2"

    return mapped_block("inner_hero_standard", {
        "page_title": title,
        "intro_paragraph": "",
        "featured_image": image,
        "image_alt": image.get("alt", "") if image else "",
        "cta_label": "",
        "cta_url": "",
    }, page, page_url, title_html + image_html, 0.99, ["page_family:not_home", "source:page_title", "source:lead_image_only"])


def block_from_segment(segment: list, page: dict, page_url: str, by_url: dict, by_name: dict, stats: dict, first: bool):
    html, text, images, embeds, links, headings = engine.transform_fragment(segment, page_url, {
        key: {"name": Path(value["local_path"]).name, "sha256": value["sha256"], "source_url": value["source_url"]}
        for key, value in by_url.items()
    }, stats)
    if not text and not images and not embeds:
        return [], []
    soup = BeautifulSoup(html, "html.parser")
    exceptions = []

    if soup.find("form"):
        exceptions.append({"page": page_url, "kind": "form", "status": "manual_review", "confidence": 0, "reason": "provider component required", "source_html_sha256": page["sha256"], "fragment_sha256": hashlib.sha256(html.encode()).hexdigest()})
        safe = clean_rich_text(remove_nodes(html, "form,script"))
        block = mapped_block("flex_content_section", {"body_content": safe or f"<p>{text}</p>", "header_tag": "h2", "image_position": "right"}, page, page_url, html, 0.91, ["source:prose_outside_provider_form", "source:provider_form_exception"])
        block["mapping"]["content_features"] = {
            "headings": len(soup.find_all(re.compile(r"^h[1-6]$"))),
            "list_items": len(soup.find_all("li")),
            "links": len(soup.find_all("a", href=True)),
            "images": len(soup.find_all("img")),
        }
        return ([block] if safe or text else []), exceptions

    if embeds:
        exceptions.append({"page": page_url, "kind": "embed", "status": "manual_review", "confidence": 0, "provider": urlparse(embeds[0]).hostname or "external", "url": embeds[0], "source_html_sha256": page["sha256"], "fragment_sha256": hashlib.sha256(html.encode()).hexdigest()})
        safe = clean_rich_text(remove_nodes(html, "iframe,embed,script"))
        safe_soup = BeautifulSoup(safe, "html.parser")
        safe_text = normalized_text(safe_soup.get_text(" ", strip=True))
        if not safe_text:
            return [], exceptions
        heading_node = safe_soup.find(re.compile(r"^h[1-6]$"))
        heading = normalized_text(heading_node.get_text(" ", strip=True)) if heading_node else ""
        body = clean_rich_text(remove_nodes(safe, "h1,h2,h3,h4,h5,h6"))
        block = mapped_block("flex_content_section", {
            "section_header": heading,
            "body_content": body or f"<p>{safe_text}</p>",
            "image_position": "right",
            "header_tag": "h2",
        }, page, page_url, html, 0.92, ["source:prose_outside_provider_embed", "source:provider_embed_exception"])
        block["mapping"]["content_features"] = {
            "headings": len(safe_soup.find_all(re.compile(r"^h[1-6]$"))),
            "list_items": len(safe_soup.find_all("li")),
            "links": len(safe_soup.find_all("a", href=True)),
            "images": 0,
        }
        return [block], exceptions

    items = feature_items(segment, page_url, by_url, by_name)
    if items:
        heading_node = next((node for node in soup.find_all(re.compile(r"^h[1-6]$")) if not node.find_parent("a")), None)
        return [mapped_block("icon_feature_cards", {
            "section_heading": normalized_text(heading_node.get_text(" ", strip=True)) if heading_node else "",
            "intro_text": "",
            "display_variant": "services" if soup.select_one(".TPctas") else "overlay",
            "items": items,
        }, page, page_url, html, 0.98, ["source:repeated_items", "source:icons", "source:TPcta"])], exceptions

    if soup.select_one(".TPquote"):
        quote_area = soup.select_one(".TPcol-xs-12") or soup
        quote_copy = BeautifulSoup(str(quote_area), "html.parser")
        for node in quote_copy.select("h1,h2,h3,h4,h5,h6,hr,.TPsocial,svg"):
            node.decompose()
        quote = normalized_text(quote_copy.get_text(" ", strip=True))
        heading = normalized_text((soup.find(re.compile(r"^h[1-6]$")) or {}).get_text(" ", strip=True)) if soup.find(re.compile(r"^h[1-6]$")) else ""
        return [mapped_block("highlight_snippet_quote", {"quote": f"<p>{quote}</p>", "attribution": heading, "tone": "brand"}, page, page_url, html, 0.98, ["source:TPquote", "source:quote_text"])], exceptions

    review_rows = [row for row in soup.select(".TProw") if row.select_one(".TPstars")]
    if review_rows:
        reviews = []
        for index, row in enumerate(review_rows, 1):
            quote_copy = BeautifulSoup(str(row), "html.parser")
            for node in quote_copy.select(".TPstars,svg"):
                node.decompose()
            quote = normalized_text(quote_copy.get_text(" ", strip=True))
            if not quote:
                continue
            reviews.append({"quote": f"<p>{quote}</p>", "sort": index})
        if reviews:
            heading_node = soup.find(re.compile(r"^h[1-6]$"))
            return [mapped_block("testimonial_list_standard", {
                "section_heading": normalized_text(heading_node.get_text(" ", strip=True)) if heading_node else "",
                "intro_text": "",
                "reviews": reviews,
            }, page, page_url, html, 0.98, ["source:review_rows", "source:TPstars", "source:quote_text"])], exceptions

    image_node = soup.find("img")
    image = source_asset(image_node.get("src"), page_url, by_url, by_name, normalized_text(image_node.get("alt"))) if image_node else None
    heading_node = soup.find(re.compile(r"^h[1-6]$"))
    heading = normalized_text(heading_node.get_text(" ", strip=True)) if heading_node else ""
    body = clean_rich_text(remove_nodes(html, "h1,h2,h3,h4,h5,h6,img,script,style"))
    link = first_link(soup, page_url)

    # Preserve standalone source callouts. The legacy estate sometimes uses a
    # heading element as the complete region (for example an insurance status
    # statement) immediately before the next section. Dropping that region
    # caused deterministic source-word loss.
    if heading and not normalized_text(BeautifulSoup(body, "html.parser").get_text(" ", strip=True)) and not image and not link:
        if heading_node.name.lower() in {"h1", "h2"}:
            return [], exceptions
        return [mapped_block("highlight_snippet_quote", {
            "quote": f"<p>{heading}</p>",
            "attribution": "",
            "tone": "brand",
        }, page, page_url, html, 0.97, ["source:standalone_heading_callout", f"source:{heading_node.name.lower()}"])], exceptions

    if first and heading_node and heading_node.name.lower() == "h1":
        return [mapped_block("inner_hero_standard", {
            "page_title": heading,
            "intro_paragraph": body,
            "featured_image": image,
            "image_alt": image.get("alt", "") if image else "",
            "cta_label": link["label"] if link else "",
            "cta_url": link["url"] if link else "",
        }, page, page_url, html, 0.95, ["source:first_content_region", "source:h1"])], exceptions

    if image and heading:
        return [mapped_block("feature_image_content", {
            "heading": heading,
            "body": body or f"<p>{text}</p>",
            "image": image,
            "image_alt": image.get("alt", ""),
            "image_position": "left" if soup.select_one(".TPcol-md-6:first-child img,.TPcol-sm-4:first-child img") else "right",
            "cta_label": link["label"] if link else "",
            "cta_url": link["url"] if link else "",
        }, page, page_url, html, 0.93, ["source:prose", "source:managed_image", "source:image_adjacent_to_prose"])], exceptions

    link_count = len(soup.find_all("a", href=True))
    if heading and link and link_count == 1 and len(text) <= 360 and not soup.find(["ul", "ol", "table"]):
        return [mapped_block("cta_section_standard", {
            "heading": heading,
            "body": body,
            "cta_label": link["label"] or heading,
            "cta_url": link["url"],
        }, page, page_url, html, 0.94, ["source:heading", "source:cta_link", "source:compact_prose"])], exceptions

    explicit_cta = soup.select_one("a.TPbtn-primary[href],a.TPbtn[href]")
    flex_body = clean_rich_text(body or html)
    if explicit_cta:
        body_soup = BeautifulSoup(flex_body, "html.parser")
        for candidate in body_soup.select("a.TPbtn-primary[href],a.TPbtn[href]"):
            candidate.decompose()
        flex_body = clean_rich_text("".join(str(node) for node in body_soup.contents))

    flex = mapped_block("flex_content_section", {
        "section_header": heading,
        "body_content": flex_body,
        "image": image,
        "image_alt": image.get("alt", "") if image else "",
        "image_position": "right",
        "header_tag": "h2",
    }, page, page_url, html, 0.90, ["source:prose", "source:flex_content_fallback"] + (["source:contextual_link"] if link else []))
    flex["mapping"]["content_features"] = {
        "headings": len(soup.find_all(re.compile(r"^h[1-6]$"))),
        "list_items": len(soup.find_all("li")),
        "links": len(soup.find_all("a", href=True)),
        "images": len(soup.find_all("img")),
    }
    blocks = [flex]
    if explicit_cta:
        cta_label = visible_link_text(explicit_cta) or "Learn more"
        cta_url = engine.normalize_url(explicit_cta.get("href"), page_url)
        flex["mapping"]["cta_handoff"] = "adjacent_cta_section_standard"
        blocks.append(mapped_block("cta_section_standard", {
            "heading": heading or cta_label,
            "body": "",
            "cta_label": cta_label,
            "cta_url": cta_url,
        }, page, page_url, str(explicit_cta), 0.97, ["source:explicit_cta_class", "source:adjacent_flex_handoff"]))
    return blocks, exceptions


def css_value(css: str, selector: str, property_name: str, fallback: str) -> str:
    match = re.search(rf"{selector}\s*\{{[^}}]*{property_name}\s*:\s*(#[0-9a-fA-F]{{6}})", css, re.I)
    return match.group(1).lower() if match else fallback


def relative_luminance(color: str) -> float:
    channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(foreground: str, background: str) -> float:
    lighter, darker = sorted((relative_luminance(foreground), relative_luminance(background)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def accessible_source_color(source: str, background: str = "#ffffff", minimum: float = 4.5) -> str:
    """Preserve the source hue while deriving the nearest contrast-safe shade."""
    if contrast_ratio(source, background) >= minimum:
        return source
    channels = [int(source[index:index + 2], 16) for index in (1, 3, 5)]
    for percent in range(99, 0, -1):
        candidate = "#" + "".join(f"{round(channel * percent / 100):02x}" for channel in channels)
        if contrast_ratio(candidate, background) >= minimum:
            return candidate
    return "#000000"


def preview_url(value: str, route_to_slug: dict[str, str]) -> str:
    if not value:
        return value
    route = urlparse(value).path
    target_slug = route_to_slug.get(route)
    if target_slug == "home":
        return "/"
    if target_slug:
        return f"/template-preview/pearl/{target_slug}/"
    return value


def rewrite_internal_links(value, route_to_slug: dict[str, str], key: str = ""):
    """Rewrite every known frozen-source route to its generated review route."""
    if isinstance(value, list):
        return [rewrite_internal_links(item, route_to_slug) for item in value]
    if isinstance(value, dict):
        return {name: rewrite_internal_links(item, route_to_slug, name) for name, item in value.items()}
    if not isinstance(value, str):
        return value
    if key == "source_url":
        return value
    if key == "url" or key.endswith("_url"):
        return preview_url(value, route_to_slug)
    if key in {"body", "body_content", "intro_paragraph", "quote"} and "href=" in value:
        soup = BeautifulSoup(value, "html.parser")
        for anchor in soup.find_all("a", href=True):
            anchor["href"] = preview_url(anchor["href"], route_to_slug)
        return "".join(str(node) for node in soup.contents)
    return value


def main():
    pages_manifest = json.loads((FREEZE / "manifests/pages.json").read_text())
    assets_manifest = json.loads((FREEZE / "manifests/assets.json").read_text())
    by_url, by_name = asset_maps(assets_manifest)
    slugs, pages_out, exceptions = {}, [], []
    stats = {"dropped_srcless_img": 0, "dropped_unevidenced_img": 0}

    for source_page in pages_manifest:
        slug = route_slug(source_page)
        if slug in slugs:
            source_id = re.search(r"-p(\d+)\.asp$", urlparse(source_page["finalUrl"]).path, re.I)
            slug = f"{slug}-{source_id.group(1) if source_id else len(slugs) + 1}"
        slugs[slug] = urlparse(source_page["finalUrl"]).path

    home_source = next(item for item in pages_manifest if item["templateFamily"] == "home")
    home_soup = BeautifulSoup((FREEZE / home_source["localPath"]).read_text(encoding="utf-8"), "html.parser")
    route_to_slug = {route: slug for slug, route in slugs.items()}

    for source_page in pages_manifest:
        page_url = source_page["sitemapUrl"]
        soup = BeautifulSoup((FREEZE / source_page["localPath"]).read_text(encoding="utf-8"), "html.parser")
        slug = next(key for key, value in slugs.items() if value == urlparse(source_page["finalUrl"]).path)
        blocks, page_exceptions = [], []
        if source_page["templateFamily"] == "home":
            hero = soup.select_one(".TPaniBannerBand")
            h1 = hero.find("h1") if hero else soup.find("h1")
            subtitle = h1.select_one(".TPsubtitle") if h1 else None
            heading = normalized_text(next((child for child in h1.children if isinstance(child, NavigableString) and normalized_text(child)), h1.get_text(" ", strip=True) if h1 else source_page["title"]))
            supporting = normalized_text(subtitle.get_text(" ", strip=True)) if subtitle else ""
            hero_image = next((source_asset(item["url"], page_url, by_url, by_name, "") for item in assets_manifest if "bkg-anibanner" in item["url"].lower() or "bkg-slider1" in item["url"].lower()), None)
            appointment = next((a for a in (hero.find_all("a", href=True) if hero else []) if "appointment" in normalized_text(a.get_text(" ", strip=True)).lower()), None)
            hero_html = str(hero) if hero else ""
            blocks.append(mapped_block("main_hero_standard", {
                "heading": heading,
                "supporting_text": supporting,
                "background_image": hero_image,
                "primary_cta_label": normalized_text(appointment.get_text(" ", strip=True)) if appointment else "",
                "primary_cta_url": engine.normalize_url(appointment.get("href"), page_url) if appointment else "",
            }, source_page, page_url, hero_html, 0.98, ["page_family:home", "source:primary_hero_region", "source:hero_media"]))
        else:
            inner_hero = extract_inner_hero(soup, source_page, page_url, by_url, by_name)
            if inner_hero:
                blocks.append(inner_hero)

        source_bands = soup.select("[id^='ArtID']")
        for band in source_bands:
            for ignored in band.select("script,style,noscript,template,[style*='display:none'],[style*='display: none']"):
                ignored.decompose()
            segments = split_band(band)
            for index, segment in enumerate(segments):
                mapped, found_exceptions = block_from_segment(segment, source_page, page_url, by_url, by_name, stats, first=False)
                blocks.extend(mapped)
                page_exceptions.extend(found_exceptions)

        if source_page["templateFamily"] != "home" and (not blocks or blocks[0]["type"] != "inner_hero_standard"):
            blocks.insert(0, mapped_block("inner_hero_standard", {
                "page_title": normalized_text(source_page["h1s"][0] if source_page["h1s"] else source_page["title"]),
                "intro_paragraph": source_page.get("metaDescription") or "",
            }, source_page, page_url, source_page.get("metaDescription") or source_page["title"], 0.91, ["page_family:not_home", "source:page_h1_or_title", "source:meta_description"]))

        pages_out.append({
            "slug": slug,
            "source_url": page_url,
            "legacy_path": urlparse(source_page["finalUrl"]).path,
            "family": source_page["templateFamily"],
            "title": normalized_text(source_page["title"]),
            "meta_description": normalized_text(source_page.get("metaDescription")),
            "source_html_sha256": source_page["sha256"],
            "blocks": blocks,
        })
        exceptions.extend(page_exceptions)

    pages_out = rewrite_internal_links(pages_out, route_to_slug)

    home = next(page for page in pages_out if page["slug"] == "home")
    contact = home_soup.select_one(".TPcontact-info")
    phone_node = contact.find("a", href=re.compile(r"^tel:")) if contact else None
    map_node = contact.find("a", href=re.compile(r"maps|google", re.I)) if contact else None
    address = visible_link_text(map_node)
    phone = visible_link_text(phone_node)
    # Contact details and the map now belong to the global footer. Do not force
    # an optional Contact Info block into the homepage composition.

    nav_region = home_soup.find("nav")
    navigation = []
    if nav_region:
        for item in nav_region.select(":scope > ul > li"):
            anchor = item.find("a", recursive=False)
            if not anchor:
                continue
            source_route = urlparse(urljoin(home_source["sitemapUrl"], anchor.get("href"))).path
            target_slug = route_to_slug.get(source_route)
            navigation.append({
                "label": normalized_text(anchor.get_text(" ", strip=True)),
                "url": "/" if target_slug == "home" else f"/template-preview/pearl/{target_slug}/" if target_slug else engine.normalize_url(anchor.get("href"), home_source["sitemapUrl"]),
                "sort": len(navigation) + 1,
            })

    logo_node = home_soup.select_one(".TPnavbar-brand img")
    logo = source_asset(logo_node.get("src"), home_source["sitemapUrl"], by_url, by_name, normalized_text(logo_node.get("alt"))) if logo_node else None
    appointment_node = next((
        anchor for anchor in home_soup.find_all("a", href=True)
        if "request-an-appointment" in anchor.get("href", "").lower()
    ), None)
    appointment_url = preview_url(
        engine.normalize_url(appointment_node.get("href"), home_source["sitemapUrl"]),
        route_to_slug,
    ) if appointment_node else ""
    email_node = home_soup.find("a", href=re.compile(r"^mailto:", re.I))
    email = email_node.get("href", "").split(":", 1)[-1].strip() if email_node else ""
    css_record = next((item for item in assets_manifest if "/webpage.css" in item["url"]), None)
    css = (FREEZE / css_record["localPath"]).read_text(encoding="utf-8", errors="ignore") if css_record else ""
    source_primary_color = css_value(css, r"H1\s+a:link", "color", "#e36966")
    mapped_primary_color = accessible_source_color(source_primary_color)
    theme = {
        "brand_name": "Lowen Perio", "brand_descriptor": "Periodontics & Implant Dentistry",
        "heading_font": "georgia", "body_font": "jost", "h1_weight": "700", "h2_weight": "600", "h3_weight": "600", "body_weight": "400",
        "heading_scale": "standard", "body_scale": "standard", "heading_line_height": "standard", "body_line_height": "standard",
        "primary_color": mapped_primary_color,
        "secondary_color": css_value(css, r"\.TPcontactbackground", "background-color", "#d3e2ec"),
        "accent_color": css_value(css, r"H2", "color", "#282d77"),
        "ink_color": css_value(css, r"P", "color", "#16324a"),
        "muted_color": "#526273", "surface_color": "#ffffff", "circle_color": css_value(css, r"H2", "color", "#282d77"),
        "spacing_scale": "standard", "content_width": "standard", "button_radius": "soft",
        "appointment_label": "Request an Appointment", "appointment_url": appointment_url,
        "phone": phone, "address": address, "email": email,
    }
    site = {"name": "Lowen Perio", "slug": "lowen-perio", "source_url": home_source["sitemapUrl"], "logo": logo, "navigation": navigation, "theme": theme}

    counts = Counter(block["type"] for page in pages_out for block in page["blocks"])
    receipt = {
        "ok": True,
        "source": site["source_url"],
        "source_family": "WEO Pearl",
        "pages": len(pages_out),
        "blocks": sum(counts.values()),
        "block_types": dict(sorted(counts.items())),
        "homepage_sequence": [block["type"] for block in home["blocks"]],
        "homepage_dynamic": True,
        "homepage_contact_block_required": False,
        "navigation_items": len(navigation),
        "theme_mapping": {
            "source_primary_color": source_primary_color,
            "mapped_primary_color": mapped_primary_color,
            "white_text_contrast": round(contrast_ratio(mapped_primary_color, "#ffffff"), 3),
            "minimum_contrast": 4.5,
        },
        "exceptions": len(exceptions),
        "manual_review_exceptions": sum(1 for item in exceptions if item.get("status") == "manual_review"),
        "minimum_auto_map_confidence": MINIMUM_AUTO_MAP_CONFIDENCE,
        "mapping_decisions": dict(sorted(Counter(block["mapping"]["decision"] for page in pages_out for block in page["blocks"]).items())),
        "dropped_unevidenced_images": stats["dropped_unevidenced_img"],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    if GENERATED_ASSETS.exists() and not any(GENERATED_ASSETS.iterdir()):
        shutil.rmtree(GENERATED_ASSETS)
    (OUT / "site.json").write_text(json.dumps(site, indent=2) + "\n")
    (OUT / "pages.json").write_text(json.dumps(pages_out, indent=2) + "\n")
    (OUT / "exceptions.json").write_text(json.dumps(exceptions, indent=2) + "\n")
    (OUT / "mapping-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
