#!/usr/bin/env python3
"""Independent frozen-source to mapped-output completeness and semantics gate."""

from __future__ import annotations

import json
import re
import warnings
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning

ROOT = Path(__file__).resolve().parents[1]
FREEZE = ROOT / "lowen-baseline-a" / "source-freeze"
MIGRATION = ROOT / "lowen-baseline-a" / "migration"
RECEIPT = Path(__file__).with_name("source-fidelity.json")
MINIMUM_WORD_COVERAGE = 0.98
DISPLAY_URL_KEYS = {"url", "cta_url", "primary_cta_url"}
NONDISPLAY_KEYS = {"source_url", "local_path", "sha256", "content_type"}
TOKEN = re.compile(r"[a-z0-9]+(?:['’][a-z0-9]+)?", re.I)

warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)


def tokens(value: str) -> list[str]:
    return [item.lower() for item in TOKEN.findall(value)]


def display_strings(value, key: str = ""):
    if isinstance(value, dict):
        for child_key, child in value.items():
            if child_key not in NONDISPLAY_KEYS and child_key not in DISPLAY_URL_KEYS:
                yield from display_strings(child, child_key)
    elif isinstance(value, list):
        for child in value:
            yield from display_strings(child, key)
    elif isinstance(value, str):
        yield BeautifulSoup(value, "html.parser").get_text(" ", strip=True)


def mapped_urls(value, key: str = ""):
    if isinstance(value, dict):
        for child_key, child in value.items():
            yield from mapped_urls(child, child_key)
    elif isinstance(value, list):
        for child in value:
            yield from mapped_urls(child, key)
    elif isinstance(value, str):
        if key in DISPLAY_URL_KEYS:
            yield value
        if key in {"body", "body_content", "intro_paragraph", "quote"}:
            yield from (anchor["href"] for anchor in BeautifulSoup(value, "html.parser").select("a[href]"))


def mapped_assets(value, key: str = ""):
    if isinstance(value, dict):
        for child_key, child in value.items():
            yield from mapped_assets(child, child_key)
    elif isinstance(value, list):
        for child in value:
            yield from mapped_assets(child, key)
    elif isinstance(value, str) and key == "source_url" and value.startswith("http"):
        yield value


pages = json.loads((MIGRATION / "pages.json").read_text())
manifest = json.loads((FREEZE / "manifests/pages.json").read_text())
source_by_hash = {item["sha256"]: item for item in manifest}
errors, ledger = [], []

for page in pages:
    source = source_by_hash[page["source_html_sha256"]]
    soup = BeautifulSoup((FREEZE / source["localPath"]).read_text(encoding="utf-8"), "html.parser")
    for node in soup.select("script,style,noscript,template,svg,[style*='display:none'],[style*='display: none']"):
        node.decompose()
    bands = soup.select("[id^='ArtID']")
    source_text = " ".join(band.get_text(" ", strip=True) for band in bands)
    output_text = " ".join(display_strings([block["item"] for block in page["blocks"]]))
    source_words, output_words = Counter(tokens(source_text)), Counter(tokens(output_text))
    source_total = sum(source_words.values())
    retained = sum(min(count, output_words[word]) for word, count in source_words.items())
    coverage = retained / source_total if source_total else 1.0

    source_links = [urljoin(page["source_url"], anchor["href"]) for band in bands for anchor in band.select("a[href]")]
    output_links = [item for block in page["blocks"] for item in mapped_urls(block["item"]) if item]
    source_images = [urljoin(page["source_url"], image["src"]) for band in bands for image in band.select("img[src]")]
    output_images = [item for block in page["blocks"] for item in mapped_assets(block["item"])]
    block_types = [block["type"] for block in page["blocks"]]

    if coverage < MINIMUM_WORD_COVERAGE:
        errors.append(f"{page['slug']}: word coverage {coverage:.3f} below {MINIMUM_WORD_COVERAGE:.2f}")
    if len(output_links) < len(source_links):
        errors.append(f"{page['slug']}: retained {len(output_links)}/{len(source_links)} source links")
    if len(output_images) < len(source_images):
        errors.append(f"{page['slug']}: retained {len(output_images)}/{len(source_images)} source images")
    if page["slug"] != "home" and (not block_types or block_types[0] != "inner_hero_standard"):
        errors.append(f"{page['slug']}: inner page does not begin with Inner Hero")
    if page["slug"] != "home" and len(block_types) < 2:
        errors.append(f"{page['slug']}: body collapsed into the hero")
    if page["slug"] == "our-services" and "cta_section_standard" in block_types:
        errors.append("our-services: service directory was misclassified as CTA")

    ledger.append({
        "slug": page["slug"],
        "source_words": source_total,
        "retained_words": retained,
        "word_coverage": round(coverage, 4),
        "source_links": len(source_links),
        "mapped_links": len(output_links),
        "source_images": len(source_images),
        "mapped_images": len(output_images),
        "block_types": block_types,
    })

receipt = {
    "ok": not errors,
    "minimum_word_coverage": MINIMUM_WORD_COVERAGE,
    "pages": len(ledger),
    "minimum_observed_word_coverage": min(item["word_coverage"] for item in ledger),
    "one_block_inner_pages": sum(len(item["block_types"]) < 2 for item in ledger if item["slug"] != "home"),
    "errors": errors,
    "ledger": ledger,
}
RECEIPT.parent.mkdir(parents=True, exist_ok=True)
RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({key: value for key, value in receipt.items() if key != "ledger"}, indent=2))
if errors:
    raise SystemExit(1)
