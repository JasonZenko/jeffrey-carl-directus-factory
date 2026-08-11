#!/usr/bin/env python3
"""Deterministic source extraction into source-backed structured records.

Reads source-freeze/ (immutable capture) and emits:
  site/src/content/frozen/site.json       - site/chrome record
  site/src/content/frozen/templates.json  - six page-family template records
  site/src/content/frozen/pages.json      - 78 page records with ordered typed blocks
  site/public/assets/<sha8>_*             - managed asset bytes (verbatim copies)
  receipts/extraction-receipt.json        - machine-readable extraction receipt

Rules (FACTORY-CONTRACT.md):
  - extractive only: every rendered byte of copy comes from the frozen source
  - ordinary flow content stays in governed rich text (text_media blocks)
  - structured blocks only where the source pattern is unambiguous
  - every block carries provenance (source url, band id, fragment sha256)
  - no whole-page HTML/JSON blobs: pages are decomposed into ordered blocks
"""

import copy
import hashlib
import json
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parents[1]
FREEZE = ROOT / "source-freeze"
SITE = ROOT / "site"
FROZEN = SITE / "src" / "content" / "frozen"
PUBLIC_ASSETS = SITE / "public" / "assets"
RECEIPTS = ROOT / "receipts"
CONTRACT = ROOT / "auditor" / "source-contract.json"

EXTRACTOR_VERSION = "foundry-semantic-extract-2.0.0"
SOURCE_HOSTS = {"jeffreycarldmd.com", "www.jeffreycarldmd.com"}

FAMILY_TO_TEMPLATE = {
    "home": ("homepage", "Homepage", "homePage"),
    "service-detail": ("service-treatment", "Service / Treatment", "servicePage"),
    "about-team": ("about-team", "About / Team", "standardPage"),
    "patient-resource": ("resource-article", "Resource / Article", "patientResourcePage"),
    "conversion": ("contact-conversion", "Contact / Conversion", "standardPage"),
    "location": ("location-practice", "Location / Practice", "standardPage"),
}

# Block blueprints per template family (labels only; global Directus template
# definitions are looked up by slug at import time and never modified).
TEMPLATE_BLOCKS = {
    "homepage": ["feature_grid", "testimonials", "team_grid", "text_media", "cta", "embed"],
    "service-treatment": ["hero", "text_media", "cta", "embed"],
    "about-team": ["hero", "text_media", "cta"],
    "resource-article": ["hero", "text_media", "cta", "form"],
    "contact-conversion": ["hero", "text_media", "cta", "form"],
    "location-practice": ["hero", "feature_grid", "testimonials", "team_grid", "text_media", "cta", "embed"],
}


def normalize_text(value):
    return re.sub(r"\s+", " ", str(value or "").replace("­", "")).strip()


def normalize_url(value, base):
    if not value:
        return ""
    absolute = urljoin(base, value)
    parsed = urlparse(absolute)
    host = (parsed.hostname or "").lower()
    if host in SOURCE_HOSTS:
        return urlunparse(("", "", parsed.path or "/", "", parsed.query, parsed.fragment))
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, "", parsed.query, parsed.fragment))


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def is_heading_carrier(node):
    if node.name and re.match(r"^h[1-6]$", node.name):
        return True
    classes = node.get("class") or []
    return node.name == "span" and "TPtitle" in classes and node.find(re.compile(r"^h[1-6]$")) is not None


def segment_band(band):
    """Split one article band into ordered segments at unambiguous boundaries."""
    segments = []
    current = []

    def flush():
        nonlocal current
        if current:
            segments.append(current)
            current = []

    for child in band.children:
        if isinstance(child, NavigableString):
            current.append(child)
            continue
        if child.find("form"):
            flush()
            segments.append([child])
            continue
        embed = child.find(["iframe", "embed"])
        if embed and not embed.find_parent("noscript"):
            flush()
            segments.append([child])
            continue
        if is_heading_carrier(child):
            flush()
            current.append(child)
            continue
        current.append(child)
    flush()
    return segments


def transform_fragment(nodes, page_url, asset_by_url, stats):
    """Serialize, normalize and govern one segment.

    Returns (html, images, embeds, links, headings). Rewrites:
      - drop script/style/noscript/template (inaudible, non-content)
      - drop img without frozen asset evidence (broken source placeholders)
      - rewrite managed img src to local /assets/ path
      - normalize link hrefs and embed srcs (internal -> path-only)
      - neuter form actions (review surface never sends)
    """
    raw = "".join(str(node) for node in nodes)
    soup = BeautifulSoup(raw, "html.parser")
    for ignored in soup.select("script,style,noscript,template"):
        ignored.decompose()

    images = []
    for img in soup.find_all("img"):
        src = img.get("src")
        if not src:
            img.decompose()
            stats["dropped_srcless_img"] += 1
            continue
        absolute = urljoin(page_url, src)
        asset = asset_by_url.get(absolute)
        if asset is None:
            img.decompose()
            stats["dropped_unevidenced_img"] += 1
            continue
        img["src"] = "/assets/" + asset["name"]
        img["data-source-url"] = absolute
        images.append({"alt": normalize_text(img.get("alt")), "source_url": absolute,
                       "sha256": asset["sha256"], "managed_path": img["src"]})

    links = []
    for anchor in soup.find_all("a", href=True):
        anchor["href"] = normalize_url(anchor["href"], page_url)
        links.append({"label": normalize_text(anchor.get_text(" ", strip=True)),
                      "href": anchor["href"], "target": anchor.get("target") or ""})

    embeds = []
    for node in soup.find_all(["iframe", "embed"], src=True):
        node["src"] = normalize_url(node["src"], page_url)
        embeds.append(node["src"])

    for form in soup.find_all("form"):
        original = normalize_url(form.get("action"), page_url)
        form["action"] = ""
        form["data-source-action"] = original
        form["data-review-noop"] = "true"
        form["onsubmit"] = "return false"

    headings = [{"level": node.name.lower(), "text": normalize_text(node.get_text(" ", strip=True))}
                for node in soup.find_all(re.compile(r"^h[1-6]$"))
                if normalize_text(node.get_text(" ", strip=True))]

    html = "".join(str(child) for child in soup.contents)
    text = normalize_text(soup.get_text(" ", strip=True))
    return html, text, images, embeds, links, headings


def classify(segment, text, images, embeds, links, headings, html, is_first_segment):
    """Map source patterns to the smallest honest native component.

    Rich text is deliberately the fallback, not the universal carrier. The
    repeated home/location composites are stable source patterns and therefore
    become typed parents with ordered child records.
    """
    soup = BeautifulSoup(html, "html.parser")
    if soup.find("form"):
        form = soup.find("form")
        hidden = {i.get("name"): i.get("value") for i in form.find_all("input", type="hidden")}
        return "form", {
            "name": form.get("name") or "legacy-form",
            "provider": "legacy-efi",
            "external_id": hidden.get("EFID"),
            "source_action": form.get("data-source-action") or "",
            "html": html,
        }
    if embeds and not images and len(text) < 40:
        src = embeds[0]
        provider = "wistia" if "wistia" in src else urlparse(src).hostname or "external"
        return "embed", {"provider": provider, "embed_url": src, "html": html}
    if is_first_segment and headings and headings[0]["level"] == "h1":
        first_img = images[0] if images else None
        first_link = next((l for l in links if l["href"]), None)
        return "hero", {
            "heading": headings[0]["text"],
            "subheading": html,
            "image": first_img["managed_path"] if first_img else None,
            "image_alt": first_img["alt"] if first_img else None,
            "primary_cta_label": first_link["label"] if first_link else None,
            "primary_cta_url": first_link["href"] if first_link else None,
            "source_html": html,
        }
    feature_links = soup.select("a.TPcta")
    if feature_links and soup.find("svg"):
        items = []
        for index, anchor in enumerate(feature_links):
            item_heading = anchor.find(re.compile(r"^h[1-6]$"))
            icon = anchor.find("svg")
            title = normalize_text(item_heading.get_text(" ", strip=True) if item_heading else anchor.get_text(" ", strip=True))
            items.append({
                "sort": index + 1,
                "title": title,
                "description": normalize_text(anchor.get("title")),
                "link_label": title,
                "link_url": anchor.get("href") or "",
                "icon_svg": str(icon) if icon else None,
            })
        remainder = BeautifulSoup(html, "html.parser")
        for row in remainder.select(".TPcta-row, .TPctas"):
            row.decompose()
        return "feature_grid", {
            "heading": headings[0]["text"] if headings else None,
            "intro": normalize_text(remainder.get_text(" ", strip=True)),
            "variant": "primary-with-intro" if soup.select_one(".TPcta-row") else "services",
            "items": items,
            "source_html": html,
        }
    if soup.select_one(".TPquote"):
        quote_region = soup.select_one(".TPcol-xs-12") or soup
        quote_copy = BeautifulSoup(str(quote_region), "html.parser")
        for node in quote_copy.select("h1,h2,h3,h4,h5,h6,hr,.TPsocial"):
            node.decompose()
        quote = normalize_text(quote_copy.get_text(" ", strip=True))
        return "testimonials", {
            "heading": headings[0]["text"] if headings else "Patient testimonial",
            "intro": None,
            "items": [{"sort": 1, "quote": quote, "name": "Patient review", "role": None, "rating": 5}],
            "source_html": html,
        }
    profile_rows = [row for row in soup.select(".TProw") if row.find("h2") and row.find("img")]
    if len(profile_rows) >= 2:
        members = []
        for index, row in enumerate(profile_rows):
            name_node = row.find("h2")
            image_node = row.find("img")
            profile_link = row.find("a", href=True)
            body = BeautifulSoup(str(row), "html.parser")
            for node in body.select("h1,h2,h3,h4,h5,h6,img,a.TPbtn"):
                node.decompose()
            raw_name = normalize_text(name_node.get_text(" ", strip=True))
            members.append({
                "sort": index + 1,
                "name": re.sub(r"^Meet\s+", "", raw_name, flags=re.I),
                "role": "Dentist",
                "bio": normalize_text(body.get_text(" ", strip=True)),
                "image": image_node.get("src") if image_node else None,
                "image_alt": normalize_text(image_node.get("alt") if image_node else ""),
                "profile_url": profile_link.get("href") if profile_link else None,
            })
        return "team_grid", {
            "heading": headings[0]["text"] if headings else "Meet the dentists",
            "intro": None,
            "members": members,
            "source_html": html,
        }
    if (headings and headings[0]["level"] in ("h2", "h3") and links
            and not images and not soup.find(["svg", "table", "ul", "ol", "img"])
            and len(text) <= 300):
        return "cta", {
            "heading": headings[0]["text"],
            "body": html,
            "primary_label": links[0]["label"],
            "primary_url": links[0]["href"],
            "secondary_label": links[1]["label"] if len(links) > 1 else None,
            "secondary_url": links[1]["href"] if len(links) > 1 else None,
            "source_html": html,
        }
    heading = headings[0]["text"] if headings else None
    first_img = images[0] if images else None
    img_node = soup.find("img")
    position = None
    if img_node is not None:
        classes = img_node.get("class") or []
        position = "right" if "TPimgRight" in classes else ("left" if "TPimgLeft" in classes else "inline")
    return "text_media", {
        "heading": heading,
        "paragraphs": [html],
        "image": first_img["managed_path"] if first_img else None,
        "image_alt": first_img["alt"] if first_img else None,
        "image_position": position,
        "source_html": html,
    }


def extract_chrome(home_soup, home_url, asset_by_url):
    """Header/footer chrome evidence from the frozen homepage (outside bands)."""
    def nav_link(anchor):
        return {
            "label": normalize_text(anchor.get_text(" ", strip=True)),
            "href": normalize_url(anchor.get("href"), home_url),
            "target": anchor.get("target") or "",
        }

    def region_links(region):
        out = []
        if not region:
            return out
        for a in region.find_all("a", href=True):
            label = normalize_text(a.get_text(" ", strip=True))
            href = normalize_url(a["href"], home_url)
            if label or href:
                out.append({"label": label, "href": href,
                            "target": a.get("target") or ""})
        return out

    nav_region = home_soup.find("nav")
    footer = home_soup.select_one(".TPcontactBand")
    phone = (home_soup.select_one(".TPcontact-info a[href^='tel:']")
             or home_soup.find("a", href=re.compile(r"^tel:")))
    seen = set()
    nav = []
    nav_items = nav_region.select(":scope > ul > li") if nav_region else []
    for item in nav_items:
        anchor = item.find("a", recursive=False)
        if not anchor:
            continue
        link = nav_link(anchor)
        submenu = item.find("ul", recursive=False)
        children = []
        if submenu:
            for child_item in submenu.find_all("li", recursive=False):
                child_anchor = child_item.find("a", recursive=False)
                if child_anchor:
                    children.append(nav_link(child_anchor))
        if children:
            link["children"] = children
        key = (link["label"], link["href"])
        if key not in seen:
            seen.add(key)
            nav.append(link)

    phone_text = normalize_text(phone.get_text(" ", strip=True)) if phone else ""
    phone_match = re.search(r"\(\d{3}\)\s*\d{3}-\d{4}", phone_text)
    if not phone_match and phone:
        phone_match = re.search(r"\(\d{3}\)\s*\d{3}-\d{4}", phone.get("href", ""))

    address_link = home_soup.select_one(".TPcontact-info a[href*='maps']")
    address_text = normalize_text(address_link.get_text(" ", strip=True)) if address_link else ""
    address_match = re.search(r"\d{3,5}\s+.+?\s+\d{5}(?:-\d{4})?", address_text)
    appointment = next((link for link in region_links(home_soup)
                        if "request" in link["label"].lower()
                        and "appointment" in link["label"].lower()), None)
    hero_video = home_soup.select_one(".TPyt-background[data-id]")
    map_embed = footer.select_one("iframe.TPmap") if footer else None
    map_embed_url = map_embed.get("src", "") if map_embed else ""
    if map_embed_url.startswith("//"):
        map_embed_url = f"https:{map_embed_url}"
    copyright_box = home_soup.select_one(".TPcopyrightBox")

    def managed_asset(fragment):
        for source_url, record in asset_by_url.items():
            if fragment in source_url:
                return f"/assets/{record['name']}"
        return ""

    return {
        "navigation": nav,
        "footer_links": region_links(footer),
        "footer_text": normalize_text(footer.get_text(" ", strip=True)) if footer else "",
        "phone": phone_match.group(0) if phone_match else phone_text,
        "phone_href": phone["href"] if phone else "",
        "address": address_match.group(0) if address_match else address_text,
        "appointment_path": appointment["href"] if appointment else "",
        "logo": managed_asset("LGO-default-c180.webp"),
        "home_hero_image": managed_asset("BKG-anibanner-c180.webp"),
        "home_hero_video_id": hero_video.get("data-id", "") if hero_video else "",
        "inner_hero_image": managed_asset("CandW-gen-bar.jpg"),
        "map_embed_url": map_embed_url,
        "copyright": normalize_text(copyright_box.get_text(" ", strip=True)) if copyright_box else "",
    }


def main():
    started = time.time()
    pages_manifest = json.loads((FREEZE / "manifests/pages.json").read_text())
    assets_manifest = json.loads((FREEZE / "manifests/assets.json").read_text())

    asset_by_url = {}
    for item in assets_manifest:
        name = Path(item["localPath"]).name
        record = {"name": name, "sha256": item["sha256"], "source_url": item["url"]}
        asset_by_url[item["url"]] = record
        asset_by_url.setdefault(item["finalUrl"], record)

    # Copy managed asset bytes verbatim.
    if PUBLIC_ASSETS.exists():
        shutil.rmtree(PUBLIC_ASSETS)
    PUBLIC_ASSETS.mkdir(parents=True, exist_ok=True)
    copied = 0
    for item in assets_manifest:
        src = FREEZE / item["localPath"]
        if src.is_file():
            shutil.copyfile(src, PUBLIC_ASSETS / Path(item["localPath"]).name)
            copied += 1

    stats = {"dropped_srcless_img": 0, "dropped_unevidenced_img": 0}
    pages_out = []
    block_type_counts = {}
    total_blocks = 0

    for page in pages_manifest:
        page_url = page["sitemapUrl"]
        soup = BeautifulSoup(
            (FREEZE / page["localPath"]).read_text(encoding="utf-8"),
            "html.parser",
        )
        route = urlparse(page["finalUrl"]).path
        family = page["templateFamily"]
        template_slug, template_name, page_type = FAMILY_TO_TEMPLATE[family]
        bands = soup.select("[id^='ArtID']")
        if not bands:
            raise RuntimeError(f"no article bands: {page_url}")

        blocks = []
        sort = 0
        for band_index, band in enumerate(bands):
            for ignored in band.select("script,style,noscript,template"):
                ignored.decompose()
            article_id = band.get("id")
            segments = segment_band(band)
            for segment_index, segment in enumerate(segments):
                html, text, images, embeds, links, headings = transform_fragment(
                    segment, page_url, asset_by_url, stats)
                if not text and not images and not embeds:
                    continue
                sort += 1
                block_type, component = classify(
                    segment, text, images, embeds, links, headings, html,
                    is_first_segment=(band_index == 0 and segment_index == 0))
                fragment_sha = sha256_bytes(html.encode())
                blocks.append({
                    "id": f"{route}#b{sort}",
                    "sort": sort,
                    "type": block_type,
                    "article_id": article_id,
                    "html": html,
                    "component": component,
                    "provenance": {
                        "source_url": page_url,
                        "source_html_sha256": page["sha256"],
                        "article_id": article_id,
                        "band_index": band_index,
                        "block_index": segment_index,
                        "fragment_sha256": fragment_sha,
                        "extractor": EXTRACTOR_VERSION,
                    },
                })
                block_type_counts[block_type] = block_type_counts.get(block_type, 0) + 1
        total_blocks += len(blocks)

        description = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
        canonical = soup.find("link", attrs={"rel": lambda v: v and "canonical" in v})
        schema_json = [s.get_text() for s in soup.find_all("script", attrs={"type": "application/ld+json"})]
        source_id = re.search(r"-p(\d+)\.asp$", route)
        pages_out.append({
            "source_id": source_id.group(1) if source_id else route,
            "legacy_path": route,
            "source_url": page_url,
            "family": family,
            "page_type": page_type,
            "template": template_slug,
            "status": "published",
            "title": normalize_text(soup.title.get_text(" ", strip=True) if soup.title else ""),
            "meta_description": normalize_text(description.get("content") if description else ""),
            "canonical": normalize_url(canonical.get("href") if canonical else "", page_url),
            "source_h1": page["h1s"],
            "schema_json": schema_json,
            "robots_index": False,
            "robots_follow": False,
            "source_html_sha256": page["sha256"],
            "blocks": blocks,
        })

    home_soup = BeautifulSoup(
        (FREEZE / pages_manifest[0]["localPath"]).read_text(encoding="utf-8"),
        "html.parser",
    )
    home_page = next(p for p in pages_out if p["family"] == "home")
    chrome = extract_chrome(
        BeautifulSoup(
            (FREEZE / next(
                p for p in pages_manifest if "Home" in p["localPath"]
            )["localPath"]).read_text(encoding="utf-8"),
            "html.parser",
        ),
        next(p for p in pages_manifest if "Home" in p["localPath"])["sitemapUrl"],
        asset_by_url)
    site_record = {
        "name": "Jeffrey Carl DMD",
        "slug": "jeffrey-carl-dmd",
        "source_url": "https://jeffreycarldmd.com/",
        "status": "noindex-review",
        "indexing_enabled": False,
        "phone": chrome["phone"],
        "phone_href": chrome["phone_href"],
        "address": chrome["address"],
        "appointment_path": chrome["appointment_path"],
        "logo": chrome["logo"],
        "home_hero_image": chrome["home_hero_image"],
        "home_hero_video_id": chrome["home_hero_video_id"],
        "inner_hero_image": chrome["inner_hero_image"],
        "map_embed_url": chrome["map_embed_url"],
        "navigation": chrome["navigation"],
        "footer": {
            "text": chrome["footer_text"],
            "copyright": chrome["copyright"],
            "links": chrome["footer_links"],
        },
        "homepage": {"legacy_path": home_page["legacy_path"]},
    }

    templates = []
    for family, (slug, name, page_type) in FAMILY_TO_TEMPLATE.items():
        templates.append({
            "slug": slug,
            "name": name,
            "family": family,
            "page_type": page_type,
            "blocks": [{"sort": i + 1, "component_type": t, "required": False}
                       for i, t in enumerate(TEMPLATE_BLOCKS[slug])],
        })

    FROZEN.mkdir(parents=True, exist_ok=True)
    (FROZEN / "site.json").write_text(json.dumps(site_record, indent=2) + "\n")
    (FROZEN / "templates.json").write_text(json.dumps(templates, indent=2) + "\n")
    (FROZEN / "pages.json").write_text(json.dumps(pages_out, indent=2) + "\n")

    # Offline reconciliation against the immutable auditor contract. This is a
    # migration-side self check; it never modifies auditor criteria.
    contract = json.loads(CONTRACT.read_text())
    mismatches = []
    by_route = {p["legacy_path"]: p for p in pages_out}
    for expected in contract["contracts"]:
        page = by_route.get(expected["route"])
        if page is None:
            mismatches.append({"route": expected["route"], "error": "missing page"})
            continue
        articles = []
        for block in page["blocks"]:
            if not articles or articles[-1][0] != block["article_id"]:
                articles.append((block["article_id"], []))
            articles[-1][1].append(block["html"])
        actual = {
            "article_ids": [a for a, _ in articles],
            "article_text": [],
            "headings": [], "links": [], "images": [], "embeds": [],
        }
        for _, fragments in articles:
            joined = BeautifulSoup("".join(fragments), "html.parser")
            actual["article_text"].append(normalize_text(joined.get_text(" ", strip=True)))
        for block in page["blocks"]:
            frag = BeautifulSoup(block["html"], "html.parser")
            for node in frag.find_all(re.compile(r"^h[1-6]$")):
                t = normalize_text(node.get_text(" ", strip=True))
                if t:
                    actual["headings"].append({"level": node.name.lower(), "text": t})
            for node in frag.find_all("a", href=True):
                actual["links"].append({
                    "label": normalize_text(node.get_text(" ", strip=True)),
                    "href": normalize_url(node["href"], expected["source_url"]),
                    "target": node.get("target") or ""})
            for node in frag.find_all("img", src=True):
                managed = PUBLIC_ASSETS / Path(urlparse(node["src"]).path).name
                actual["images"].append({
                    "alt": normalize_text(node.get("alt")),
                    "sha256": sha256_bytes(managed.read_bytes()) if managed.is_file() else None})
            for node in frag.find_all(["iframe", "embed"], src=True):
                actual["embeds"].append(normalize_url(node["src"], expected["source_url"]))
        actual["metadata"] = {"title": page["title"], "description": page["meta_description"],
                              "canonical": page["canonical"]}
        checks = {
            "article_ids": actual["article_ids"] == expected["article_ids"],
            "article_text": actual["article_text"] == expected["article_text"],
            "headings": actual["headings"] == expected["headings"],
            "links": actual["links"] == expected["links"],
            "image_alt": [x["alt"] for x in actual["images"]] == [x["alt"] for x in expected["images"]],
            "image_bytes": [x["sha256"] for x in actual["images"]] == [x["sha256"] for x in expected["images"]],
            "embeds": actual["embeds"] == expected["embeds"],
            "metadata": actual["metadata"] == expected["metadata"],
        }
        if not all(checks.values()):
            mismatches.append({"route": expected["route"], "checks": checks})

    elapsed = time.time() - started
    receipt = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "extractor": EXTRACTOR_VERSION,
        "elapsed_seconds": round(elapsed, 3),
        "routes": len(pages_out),
        "article_bands": sum(len({b["article_id"] for b in p["blocks"]}) for p in pages_out),
        "blocks": total_blocks,
        "block_types": block_type_counts,
        "assets_copied": copied,
        "dropped_unevidenced_images": stats["dropped_unevidenced_img"],
        "dropped_srcless_images": stats["dropped_srcless_img"],
        "contract_routes": contract["routes"],
        "contract_reconciliation": {
            "checked": contract["routes"],
            "mismatches": len(mismatches),
            "routes": mismatches,
        },
        "outputs_sha256": {
            "site.json": sha256_bytes((FROZEN / "site.json").read_bytes()),
            "templates.json": sha256_bytes((FROZEN / "templates.json").read_bytes()),
            "pages.json": sha256_bytes((FROZEN / "pages.json").read_bytes()),
        },
    }
    RECEIPTS.mkdir(exist_ok=True)
    (RECEIPTS / "extraction-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({k: v for k, v in receipt.items() if k != "contract_reconciliation"}, indent=2))
    print(json.dumps({"reconciliation_mismatches": len(mismatches),
                      "routes": [m["route"] for m in mismatches][:20]}, indent=2))
    if mismatches:
        detail = RECEIPTS / "extraction-mismatches.json"
        detail.write_text(json.dumps(mismatches, indent=2) + "\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
