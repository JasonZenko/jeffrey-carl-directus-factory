#!/usr/bin/env python3
"""Build immutable route-level audit evidence from the frozen source."""

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
FREEZE = ROOT / "source-freeze"
OUT = ROOT / "auditor" / "source-contract.json"


def normalize_text(value):
    return re.sub(r"\s+", " ", str(value or "").replace("\u00ad", "")).strip()


def normalize_url(value, base):
    if not value:
        return ""
    absolute = urljoin(base, value)
    parsed = urlparse(absolute)
    host = (parsed.hostname or "").lower()
    if host in {"jeffreycarldmd.com", "www.jeffreycarldmd.com"}:
        return urlunparse(("", "", parsed.path or "/", "", parsed.query, parsed.fragment))
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, "", parsed.query, parsed.fragment))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


pages = json.loads((FREEZE / "manifests/pages.json").read_text())
assets = json.loads((FREEZE / "manifests/assets.json").read_text())
asset_by_url = {item["url"]: item for item in assets}
asset_by_final = {item["finalUrl"]: item for item in assets}

contracts = []
for page in pages:
    page_path = FREEZE / page["localPath"]
    soup = BeautifulSoup(page_path.read_text(encoding="utf-8"), "html.parser")
    articles = soup.select("[id^='ArtID']")
    if not articles:
        raise RuntimeError(f"No source article bands found for {page['sitemapUrl']}")

    for node in articles:
        for ignored in node.select("script,style,noscript,template"):
            ignored.decompose()
        # The legacy shell injects hidden schema.org helper markup inside some
        # article bands, including an invalid ``src=\"Logo URL\"`` placeholder.
        # It is not rendered page content and the capture correctly excludes it
        # from the first-party asset manifest, so keep it out of the fidelity
        # contract rather than forcing the migration to reproduce a broken asset.
        for hidden in node.select('[style*="display:none"], [style*="display: none"]'):
            hidden.decompose()

    ordered_text = [normalize_text(node.get_text(" ", strip=True)) for node in articles]
    headings = [
        {"level": node.name.lower(), "text": normalize_text(node.get_text(" ", strip=True))}
        for article in articles
        for node in article.find_all(re.compile(r"^h[1-6]$"))
        if normalize_text(node.get_text(" ", strip=True))
    ]
    links = [
        {
            "label": normalize_text(node.get_text(" ", strip=True)),
            "href": normalize_url(node.get("href"), page["sitemapUrl"]),
            "target": node.get("target") or "",
        }
        for article in articles
        for node in article.find_all("a", href=True)
    ]
    images = []
    for article in articles:
        for node in article.find_all("img", src=True):
            absolute = urljoin(page["sitemapUrl"], node["src"])
            item = asset_by_url.get(absolute) or asset_by_final.get(absolute)
            digest = sha256(FREEZE / item["localPath"]) if item else None
            images.append({
                "alt": normalize_text(node.get("alt")),
                "source_url": absolute,
                "sha256": digest,
            })
    embeds = [
        normalize_url(node.get("src"), page["sitemapUrl"])
        for article in articles
        for node in article.find_all(["iframe", "embed"], src=True)
    ]
    description = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
    canonical = soup.find("link", attrs={"rel": lambda value: value and "canonical" in value})
    parsed = urlparse(page["finalUrl"])
    contracts.append({
        "route": parsed.path,
        "source_url": page["sitemapUrl"],
        "family": page["templateFamily"],
        "source_html_sha256": page["sha256"],
        "article_ids": [node.get("id") for node in articles],
        "article_text": ordered_text,
        "headings": headings,
        "links": links,
        "images": images,
        "embeds": embeds,
        "metadata": {
            "title": normalize_text(soup.title.get_text(" ", strip=True) if soup.title else ""),
            "description": normalize_text(description.get("content") if description else ""),
            "canonical": normalize_url(canonical.get("href") if canonical else "", page["sitemapUrl"]),
        },
    })

payload = {
    "generated_at": "2026-08-11T11:44:24Z",
    "source": "source-freeze/manifests/pages.json",
    "routes": len(contracts),
    "families": sorted({item["family"] for item in contracts}),
    "contracts": contracts,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, indent=2) + "\n")
print(json.dumps({
    "routes": payload["routes"],
    "families": payload["families"],
    "article_bands": sum(len(item["article_ids"]) for item in contracts),
    "links": sum(len(item["links"]) for item in contracts),
    "images": sum(len(item["images"]) for item in contracts),
    "embeds": sum(len(item["embeds"]) for item in contracts),
}, indent=2))
