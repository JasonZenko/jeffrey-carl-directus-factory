#!/usr/bin/env python3
"""Map frozen WEO Pearl source objects onto the approved 14-block Pearl contract.

This mapper never starts from a target page skeleton. It walks ordered source
objects, classifies each object, and emits the corresponding Pearl block in the
same order. The Pearl adapter owns presentation; the source owns composition.
"""

from __future__ import annotations

import argparse
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
MAPPING_MODES = ("presentation", "utility")

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


def derived_svg(svg: Tag, label: str, source_color: str = ""):
    clone = BeautifulSoup(str(svg), "html.parser").find("svg")
    if clone is None:
        return None
    if not clone.get("xmlns"):
        clone["xmlns"] = "http://www.w3.org/2000/svg"
    if source_color:
        source_style = str(clone.get("style") or "").rstrip(";")
        clone["style"] = ";".join(value for value in (source_style, f"color:{source_color}") if value) + ";"
        if not clone.has_attr("fill") and not clone.has_attr("stroke"):
            clone["fill"] = source_color
    payload_text = str(clone)
    if source_color:
        # External SVG files do not inherit the source page's CSS `color`.
        # Materialise the captured source colour so currentColor remains exact
        # after the icon is uploaded to Directus and rendered through <img>.
        payload_text = re.sub(r"currentcolor", source_color, payload_text, flags=re.I)
    payload = payload_text.encode()
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
        source_classes = node.get("class", [])
        semantic_classes = []
        if node.name == "a" and any(value in {"TPbtn", "TPbtn-primary"} for value in source_classes):
            semantic_classes.append("paragraph-button")
        classes = semantic_classes + [value for value in source_classes if not value.lower().startswith("tp")]
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


def remove_first_link(value: str) -> str:
    """Remove a link already promoted to a dedicated CTA without duplicating it."""
    soup = BeautifulSoup(value or "", "html.parser")
    anchor = soup.find("a", href=True)
    if anchor:
        anchor.decompose()
    return clean_rich_text("".join(str(node) for node in soup.contents))


def feature_items(segment: list, page_url: str, by_url: dict, by_name: dict, icon_color: str):
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
            icon = derived_svg(anchor.find("svg"), title, icon_color)
        if icon is None:
            continue
        visible_body = BeautifulSoup(str(anchor), "html.parser").find("a")
        for node in visible_body.select("h1,h2,h3,h4,h5,h6,svg,img"):
            node.decompose()
        body = normalized_text(visible_body.get_text(" ", strip=True))
        items.append({
            "icon": icon,
            "title": title,
            "body": body if body and body != title else "",
            "link_title": normalized_text(anchor.get("title")),
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
            # Preserve the source's explicit paragraph/line boundary. Replacing
            # BR elements with spaces made separate paragraphs render as one
            # continuous sentence and collapsed addresses and office hours.
            current.append(child)
            continue
        classes = set(child.get("class") or [])
        special = bool(classes & {"TPcta-row", "TPctas", "TPquote", "TPlist-group"}) or bool(child.select_one(".TPcta-row,.TPctas,.TPquote,.TPlist-group"))
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

    # The first source prose belongs to the Inner Hero. Consume direct source
    # nodes up to the first real heading/specialised region. Styled bold copy is
    # intentionally left as emphasis: presentation alone is not heading proof.
    intro_nodes = []
    started = False
    trailing_breaks = 0
    for child in list(band.children):
        if isinstance(child, NavigableString):
            if normalized_text(child):
                started = True
                trailing_breaks = 0
                intro_nodes.append(child)
            elif started:
                intro_nodes.append(child)
            continue
        if not isinstance(child, Tag):
            continue
        if child.name in {"h1", "h2", "h3", "h4", "h5", "h6", "form", "iframe", "embed"} or child.select_one("form,iframe,embed,.TPcta-row,.TPctas,.TPquote,.TPlist-group"):
            break
        if started and child.name in {"div", "section", "table", "ul", "ol"}:
            break
        if child.name in {"br", "hr"} and not started:
            child.decompose()
            continue
        if child.name in {"br", "hr"}:
            trailing_breaks += 1
            if trailing_breaks >= 2:
                break
        else:
            trailing_breaks = 0
        started = True
        intro_nodes.append(child)

    intro_html = clean_rich_text("".join(str(node) for node in intro_nodes)).strip()
    for node in intro_nodes:
        if isinstance(node, Tag):
            node.decompose()
        else:
            node.extract()

    return mapped_block("inner_hero_standard", {
        "page_title": title,
        "intro_paragraph": intro_html,
        "featured_image": image,
        "image_alt": image.get("alt", "") if image else "",
        "cta_label": "",
        "cta_url": "",
    }, page, page_url, title_html + image_html + intro_html, 0.99, ["page_family:not_home", "source:page_title", "source:lead_image", "source:opening_prose"])


def utility_flex_block(html: str, page: dict, page_url: str, by_url: dict, by_name: dict) -> dict:
    """Map one ordered source segment with minimal semantic interpretation."""
    soup = BeautifulSoup(html, "html.parser")
    heading_node = soup.find(re.compile(r"^h[1-6]$"))
    heading = normalized_text(heading_node.get_text(" ", strip=True)) if heading_node else ""
    image_node = soup.find("img")
    image = source_asset(image_node.get("src"), page_url, by_url, by_name, normalized_text(image_node.get("alt"))) if image_node else None
    body = clean_rich_text(remove_nodes(html, "h1,h2,h3,h4,h5,h6,img,script,style"))
    block = mapped_block("flex_content_section", {
        "section_header": heading,
        "body_content": body,
        "image": image,
        "image_alt": image.get("alt", "") if image else "",
        "image_position": "right",
        "header_tag": heading_node.name.lower() if heading_node else "h2",
    }, page, page_url, html, 0.99, ["mapping_mode:utility", "source:ordered_segment", "source:minimal_interpretation"])
    block["mapping"]["content_features"] = {
        "headings": len(soup.find_all(re.compile(r"^h[1-6]$"))),
        "list_items": len(soup.find_all("li")),
        "links": len(soup.find_all("a", href=True)),
        "images": len(soup.find_all("img")),
    }
    return block


def block_from_segment(segment: list, page: dict, page_url: str, by_url: dict, by_name: dict, stats: dict, first: bool, icon_color: str, mode: str = "presentation"):
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

    if mode == "utility":
        return [utility_flex_block(html, page, page_url, by_url, by_name)], exceptions

    highlight_nodes = soup.select("a.TPlist-group-item[href]")
    if highlight_nodes:
        links_out = [{
            "link_label": visible_link_text(anchor),
            "link_url": engine.normalize_url(anchor.get("href"), page_url),
            "sort": index,
        } for index, anchor in enumerate(highlight_nodes, 1) if visible_link_text(anchor)]
        if links_out:
            heading_node = next((node for node in soup.find_all(re.compile(r"^h[1-6]$")) if not node.find_parent("a")), None)
            return [mapped_block("highlight_links", {
                "section_heading": normalized_text(heading_node.get_text(" ", strip=True)) if heading_node else "",
                "links": links_out,
            }, page, page_url, html, 0.99, ["source:TPlist-group", "source:TPlist-group-item", "source:ordered_links"])], exceptions

    items = feature_items(segment, page_url, by_url, by_name, icon_color)
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
        social = soup.select_one(".TPsocial a[href]")
        social_markup = ""
        if social:
            social_label = normalized_text((social.find("img") or {}).get("alt")) if social.find("img") else normalized_text(social.get_text(" ", strip=True))
            social_url = engine.normalize_url(social.get("href"), page_url)
            social_markup = f'<p class="pearl-source-social"><a href="{social_url}">{social_label or "Source review"}</a></p>'
        return [mapped_block("highlight_snippet_quote", {"snippet": heading, "quote": f"<p>{quote}</p>{social_markup}", "attribution": "", "tone": "brand"}, page, page_url, html, 0.99, ["source:TPquote", "source:snippet_heading", "source:quote_text", "source:social_link_preserved"])], exceptions

    review_rows = [row for row in soup.select(".TProw") if row.select_one(".TPstars")]
    if review_rows:
        reviews = []
        for index, row in enumerate(review_rows, 1):
            quote_copy = BeautifulSoup(str(row), "html.parser")
            patient_heading = quote_copy.find(re.compile(r"^h[1-6]$"))
            patient_name = normalized_text(patient_heading.get_text(" ", strip=True)) if patient_heading else ""
            if patient_heading:
                patient_heading.decompose()
            for node in quote_copy.select(".TPstars,svg"):
                node.decompose()
            quote = normalized_text(quote_copy.get_text(" ", strip=True))
            if not quote:
                continue
            reviews.append({"patient_name": patient_name, "quote": f"<p>{quote}</p>", "sort": index})
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
        if heading_node.name.lower() == "h1":
            return [], exceptions
        if heading_node.name.lower() in {"h2", "h3", "h4", "h5", "h6"}:
            block = mapped_block("flex_content_section", {
                "section_header": heading,
                "body_content": "<p></p>",
                "image_position": "right",
                "header_tag": heading_node.name.lower(),
            }, page, page_url, html, 0.99, ["source:standalone_section_heading", f"source:{heading_node.name.lower()}"])
            block["mapping"]["content_features"] = {"headings": 1, "list_items": 0, "links": 0, "images": 0}
            return [block], exceptions
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
        if heading_node.name.lower() != "h2":
            block = mapped_block("flex_content_section", {
                "section_header": heading,
                "body_content": body or f"<p>{text}</p>",
                "image": image,
                "image_alt": image.get("alt", ""),
                "image_position": "left" if soup.select_one(".TPcol-md-6:first-child img,.TPcol-sm-4:first-child img") else "right",
                "header_tag": heading_node.name.lower(),
            }, page, page_url, html, 0.95, ["source:prose", "source:managed_image", "source:heading_level_preserved"])
            block["mapping"]["content_features"] = {
                "headings": len(soup.find_all(re.compile(r"^h[1-6]$"))),
                "list_items": len(soup.find_all("li")),
                "links": len(soup.find_all("a", href=True)),
                "images": len(soup.find_all("img")),
            }
            return [block], exceptions
        return [mapped_block("feature_image_content", {
            "heading": heading,
            "body": remove_first_link(body) if link else (body or f"<p>{text}</p>"),
            "image": image,
            "image_alt": image.get("alt", ""),
            "image_position": "left" if soup.select_one(".TPcol-md-6:first-child img,.TPcol-sm-4:first-child img") else "right",
            "cta_label": link["label"] if link else "",
            "cta_url": link["url"] if link else "",
        }, page, page_url, html, 0.93, ["source:prose", "source:managed_image", "source:image_adjacent_to_prose"])], exceptions

    link_count = len(soup.find_all("a", href=True))
    anchor = soup.find("a", href=True)
    anchor_classes = set(anchor.get("class") or []) if anchor else set()
    explicit_cta_evidence = bool(anchor_classes & {"TPbtn", "TPbtn-primary", "paragraph-button"})
    generic_cta_candidate = explicit_cta_evidence and heading and link and link_count == 1 and len(text) <= 360 and not soup.find(["ul", "ol", "table"])
    flex_body = clean_rich_text(body or html)

    flex = mapped_block("flex_content_section", {
        "section_header": heading,
        "body_content": flex_body,
        "image": image,
        "image_alt": image.get("alt", "") if image else "",
        "image_position": "right",
        "header_tag": heading_node.name.lower() if heading_node else "h2",
    }, page, page_url, html, 0.90, ["source:prose", "source:flex_content_fallback"] + (["source:contextual_link"] if link else []))
    flex["mapping"]["content_features"] = {
        "headings": len(soup.find_all(re.compile(r"^h[1-6]$"))),
        "list_items": len(soup.find_all("li")),
        "links": len(soup.find_all("a", href=True)),
        "images": len(soup.find_all("img")),
    }
    if generic_cta_candidate:
        flex["mapping"]["cta_candidate"] = {
            "heading": heading,
            "body": remove_first_link(body),
            "cta_label": link["label"] or heading,
            "cta_url": link["url"],
        }
        flex["mapping"]["signals"].append("source:compact_cta_candidate")
        flex["mapping"]["signals"].append("source:explicit_cta_control")
    return [flex], exceptions


def fold_adjacent_component_headings(blocks: list[dict]) -> list[dict]:
    """Move a standalone source heading into the component that owns it."""
    folded = []
    index = 0
    while index < len(blocks):
        current = blocks[index]
        following = blocks[index + 1] if index + 1 < len(blocks) else None
        body_text = normalized_text(BeautifulSoup(current.get("item", {}).get("body_content", ""), "html.parser").get_text(" ", strip=True))
        if (
            current.get("type") == "flex_content_section"
            and current.get("item", {}).get("section_header")
            and not body_text
            and following
            and following.get("type") == "highlight_links"
            and not following.get("item", {}).get("section_heading")
        ):
            following["item"]["section_heading"] = current["item"]["section_header"]
            following["mapping"]["signals"].append("source:adjacent_heading_folded")
            folded.append(following)
            index += 2
            continue
        folded.append(current)
        index += 1
    return folded


def compose_contact_info(blocks: list[dict], slug: str, page: dict, page_url: str) -> list[dict]:
    """Use the native Contact Info block when the source provides its fields."""
    if "contact" not in slug:
        return blocks
    location_index = next((i for i, block in enumerate(blocks) if block.get("type") == "flex_content_section" and normalized_text(block.get("item", {}).get("section_header")).rstrip(":").lower() == "location"), None)
    contact_index = next((i for i, block in enumerate(blocks) if block.get("type") == "flex_content_section" and normalized_text(block.get("item", {}).get("section_header")).rstrip(":").lower() == "contact information"), None)
    if location_index is None or contact_index is None:
        return blocks
    location = blocks[location_index]
    contact = blocks[contact_index]
    address = normalized_text(BeautifulSoup(location["item"].get("body_content", ""), "html.parser").get_text(" ", strip=True))
    contact_soup = BeautifulSoup(contact["item"].get("body_content", ""), "html.parser")
    contact_text = normalized_text(contact_soup.get_text(" ", strip=True))
    phone_match = re.search(r"Phone:\s*([+\d][\d\s().-]+?)(?=\s+Fax:|\s+Email:|$)", contact_text, re.I)
    fax_match = re.search(r"Fax:\s*([+\d][\d\s().-]+?)(?=\s+Email:|$)", contact_text, re.I)
    email_node = contact_soup.find("a", href=re.compile(r"^mailto:", re.I))
    email = email_node.get("href", "").split(":", 1)[-1].strip() if email_node else ""
    evidence_html = location["item"].get("body_content", "") + contact["item"].get("body_content", "")
    contact_block = mapped_block("contact_info_standard", {
        "heading": "Contact Information:",
        "address": address,
        "phone": normalized_text(phone_match.group(1)) if phone_match else "",
        "email": email,
        "map_url": "",
    }, page, page_url, evidence_html, 0.99, ["source:contact_page", "source:location_heading", "source:contact_information_heading"])
    replacement = [contact_block]
    if fax_match:
        fax_block = mapped_block("flex_content_section", {
            "section_header": "Fax",
            "body_content": f"<p>{normalized_text(fax_match.group(1))}</p>",
            "image_position": "right",
            "header_tag": "h2",
        }, page, page_url, contact["item"].get("body_content", ""), 0.99, ["source:contact_page", "source:fax_preserved"])
        fax_block["mapping"]["content_features"] = {"headings": 0, "list_items": 0, "links": 0, "images": 0}
        replacement.append(fax_block)
    output = []
    for index, block in enumerate(blocks):
        if index == min(location_index, contact_index):
            output.extend(replacement)
        if index not in {location_index, contact_index}:
            output.append(block)
    return output


def collapse_registered_simple_page(blocks: list[dict], slug: str) -> list[dict]:
    """Keep fixture-proven prose pages as one editable Flex region after the hero."""
    if slug != "what-is-a-periodontist" or len(blocks) < 3:
        return blocks
    body_blocks = blocks[1:]
    if any(block.get("type") != "flex_content_section" for block in body_blocks):
        return blocks
    if any(block.get("item", {}).get("image") for block in body_blocks[1:]):
        return blocks
    first = body_blocks[0]
    combined = [first.get("item", {}).get("body_content", "")]
    for block in body_blocks[1:]:
        item = block.get("item", {})
        heading = normalized_text(item.get("section_header"))
        if heading:
            tag = item.get("header_tag") or "h2"
            combined.append(f"<{tag}>{heading}</{tag}>")
        combined.append(item.get("body_content", ""))
    first["item"]["body_content"] = clean_rich_text("".join(combined))
    first["mapping"]["signals"].append("fixture:single_flex_content_region")
    return [blocks[0], first]


def assert_page_block_invariants(blocks: list[dict], family: str, slug: str, mode: str) -> None:
    if family != "home":
        heroes = [index for index, block in enumerate(blocks) if block.get("type") == "inner_hero_standard"]
        if heroes != [0]:
            raise RuntimeError(f"{slug}: expected exactly one leading Inner Hero, found indexes {heroes}")
        if mode == "utility" and any(block.get("type") != "flex_content_section" for block in blocks[1:]):
            raise RuntimeError(f"{slug}: utility mode emitted a specialised inner-page block")


def promote_terminal_cta(blocks: list[dict]) -> list[dict]:
    """Promote at most one CTA, and only when it is the final source block."""
    for index, block in enumerate(blocks):
        candidate = block.get("mapping", {}).pop("cta_candidate", None)
        if not candidate:
            continue
        if index != len(blocks) - 1:
            block["mapping"]["signals"].append("page_gate:cta_rejected_not_terminal")
            continue
        source_mapping = block["mapping"]
        blocks[index] = {
            "type": "cta_section_standard",
            "item": candidate,
            "mapping": {
                **source_mapping,
                "confidence": 0.99,
                "signals": [
                    signal for signal in source_mapping["signals"]
                    if signal not in {"source:flex_content_fallback", "source:compact_cta_candidate"}
                ] + ["source:compact_cta_candidate", "page_gate:terminal_block", "page_gate:single_cta"],
            },
        }
    return blocks


def css_value(css: str, selector: str, property_name: str, fallback: str) -> str:
    match = re.search(rf"{selector}\s*\{{[^}}]*{property_name}\s*:\s*(#[0-9a-fA-F]{{6}})", css, re.I)
    return match.group(1).lower() if match else fallback


def css_url_value(css: str, selector: str, property_name: str) -> str:
    match = re.search(rf"{selector}\s*\{{[^}}]*{property_name}\s*:\s*url\((['\"]?)([^)'\"]+)\1\)", css, re.I)
    return match.group(2).strip() if match else ""


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


def preview_url(value: str, route_to_slug: dict[str, str], asset_routes: dict[str, str] | None = None) -> str:
    if not value:
        return value
    route = urlparse(value).path
    if asset_routes and route in asset_routes:
        return asset_routes[route]
    target_slug = route_to_slug.get(route)
    if target_slug == "home":
        return "/"
    if target_slug:
        return f"/{target_slug}/"
    if value.startswith("/"):
        return urljoin("https://www.lowenperio.com", value)
    return value


def rewrite_internal_links(value, route_to_slug: dict[str, str], asset_routes: dict[str, str], key: str = ""):
    """Rewrite every known frozen-source route to its generated review route."""
    if isinstance(value, list):
        return [rewrite_internal_links(item, route_to_slug, asset_routes) for item in value]
    if isinstance(value, dict):
        return {name: rewrite_internal_links(item, route_to_slug, asset_routes, name) for name, item in value.items()}
    if not isinstance(value, str):
        return value
    if key == "source_url":
        return value
    if key == "url" or key.endswith("_url"):
        return preview_url(value, route_to_slug, asset_routes)
    if key in {"body", "body_content", "intro_paragraph", "quote"} and "href=" in value:
        soup = BeautifulSoup(value, "html.parser")
        for anchor in soup.find_all("a", href=True):
            anchor["href"] = preview_url(anchor["href"], route_to_slug, asset_routes)
        return "".join(str(node) for node in soup.contents)
    return value


def main(mode: str = "presentation"):
    if mode not in MAPPING_MODES:
        raise ValueError(f"Unknown mapping mode: {mode}")
    if GENERATED_ASSETS.exists():
        shutil.rmtree(GENERATED_ASSETS)
    pages_manifest = json.loads((FREEZE / "manifests/pages.json").read_text())
    assets_manifest = json.loads((FREEZE / "manifests/assets.json").read_text())
    by_url, by_name = asset_maps(assets_manifest)
    css_record = next((item for item in assets_manifest if "/webpage.css" in item["url"]), None)
    css = (FREEZE / css_record["localPath"]).read_text(encoding="utf-8", errors="ignore") if css_record else ""
    icon_color = css_value(css, r"\.TPcta\s+svg", "color", "#fde4d7")
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
    route_to_slug.update({f"/{slug}/": slug for slug in slugs})
    asset_routes = {
        urlparse(item["url"]).path: f"/lowen-assets/{item['sha256'][:12]}-{Path(urlparse(item['url']).path).name}"
        for item in assets_manifest
        if item.get("contentType") == "application/pdf"
    }
    services_background = source_asset(
        css_url_value(css, r"\.TPart2Band", "background-image"),
        home_source["sitemapUrl"],
        by_url,
        by_name,
        "Portland skyline",
    )

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
                mapped, found_exceptions = block_from_segment(segment, source_page, page_url, by_url, by_name, stats, first=False, icon_color=icon_color, mode=mode if source_page["templateFamily"] != "home" else "presentation")
                for block in mapped:
                    if block["type"] == "icon_feature_cards" and block["item"].get("display_variant") == "services" and services_background:
                        block["item"]["background_image"] = services_background
                        block["mapping"]["signals"].append("source:TPart2Band_background_image")
                blocks.extend(mapped)
                page_exceptions.extend(found_exceptions)

        if source_page["templateFamily"] != "home" and (not blocks or blocks[0]["type"] != "inner_hero_standard"):
            blocks.insert(0, mapped_block("inner_hero_standard", {
                "page_title": normalized_text(source_page["h1s"][0] if source_page["h1s"] else source_page["title"]),
                "intro_paragraph": source_page.get("metaDescription") or "",
            }, source_page, page_url, source_page.get("metaDescription") or source_page["title"], 0.91, ["page_family:not_home", "source:page_h1_or_title", "source:meta_description"]))

        if mode == "presentation":
            blocks = fold_adjacent_component_headings(blocks)
            blocks = compose_contact_info(blocks, slug, source_page, page_url)
            blocks = promote_terminal_cta(blocks)
            blocks = collapse_registered_simple_page(blocks, slug)
        assert_page_block_invariants(blocks, source_page["templateFamily"], slug, mode)

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

    pages_out = rewrite_internal_links(pages_out, route_to_slug, asset_routes)

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
                "url": "/" if target_slug == "home" else f"/{target_slug}/" if target_slug else engine.normalize_url(anchor.get("href"), home_source["sitemapUrl"]),
                "sort": len(navigation) + 1,
                "children": [],
            })
            for child_index, child in enumerate(item.select(":scope > ul > li"), 1):
                child_anchor = child.find("a", recursive=False)
                if not child_anchor:
                    continue
                child_route = urlparse(urljoin(home_source["sitemapUrl"], child_anchor.get("href"))).path
                child_slug = route_to_slug.get(child_route)
                navigation[-1]["children"].append({
                    "label": normalized_text(child_anchor.get_text(" ", strip=True)),
                    "url": "/" if child_slug == "home" else f"/{child_slug}/" if child_slug else engine.normalize_url(child_anchor.get("href"), home_source["sitemapUrl"]),
                    "sort": child_index,
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
        asset_routes,
    ) if appointment_node else ""
    email_node = home_soup.find("a", href=re.compile(r"^mailto:", re.I))
    email = email_node.get("href", "").split(":", 1)[-1].strip() if email_node else ""
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
        "navigation_items": sum(1 + len(item["children"]) for item in navigation),
        "navigation_root_items": len(navigation),
        "theme_mapping": {
            "source_primary_color": source_primary_color,
            "mapped_primary_color": mapped_primary_color,
            "white_text_contrast": round(contrast_ratio(mapped_primary_color, "#ffffff"), 3),
            "minimum_contrast": 4.5,
        },
        "exceptions": len(exceptions),
        "manual_review_exceptions": sum(1 for item in exceptions if item.get("status") == "manual_review"),
        "minimum_auto_map_confidence": MINIMUM_AUTO_MAP_CONFIDENCE,
        "mapping_mode": mode,
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=MAPPING_MODES, default="presentation")
    main(parser.parse_args().mode)
