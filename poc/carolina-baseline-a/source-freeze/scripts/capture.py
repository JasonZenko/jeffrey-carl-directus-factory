#!/usr/bin/env python3
import csv
import hashlib
import json
import mimetypes
import os
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CAPTURE = ROOT / "capture"
HTML_DIR = CAPTURE / "html"
ASSET_DIR = CAPTURE / "assets"
SITEMAP_DIR = CAPTURE / "sitemaps"
MANIFEST_DIR = ROOT / "manifests"
SOURCE = os.environ.get("SOURCE_URL", "https://www.carolinacomfortdental.com/").rstrip("/") + "/"
SOURCE_HOST = (urlparse(SOURCE).hostname or "").lower()
SOURCE_HOSTS = {SOURCE_HOST}
if SOURCE_HOST.startswith("www."):
    SOURCE_HOSTS.add(SOURCE_HOST.removeprefix("www."))
else:
    SOURCE_HOSTS.add(f"www.{SOURCE_HOST}")
ASSET_HOSTS = SOURCE_HOSTS | {
    host.strip().lower()
    for host in os.environ.get("SOURCE_ASSET_HOSTS", "cdn-bjnjg.nitrocdn.com").split(",")
    if host.strip()
}
SITEMAP = os.environ.get("SOURCE_SITEMAP", urljoin(SOURCE, "/sitemap.xml"))
UA = "FoundryWorks-PearlBaselineCapture/1.0 (+read-only source preservation)"
TIMEOUT = 40
VIDEO_HOSTS = {
    "youtube.com": "youtube", "youtu.be": "youtube",
    "vimeo.com": "vimeo", "player.vimeo.com": "vimeo",
    "wistia.com": "wistia", "wistia.net": "wistia", "fast.wistia.net": "wistia",
}
THIRD_PARTY_HINTS = {
    "googletagmanager.com": "analytics", "google-analytics.com": "analytics",
    "google.com": "google", "gstatic.com": "google", "facebook.com": "facebook",
    "facebook.net": "facebook", "instagram.com": "instagram",
    "youtube.com": "youtube", "youtu.be": "youtube", "vimeo.com": "vimeo",
    "wistia.com": "wistia", "wistia.net": "wistia",
}

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept": "*/*"})

for d in (HTML_DIR, ASSET_DIR, SITEMAP_DIR, MANIFEST_DIR):
    d.mkdir(parents=True, exist_ok=True)

def now():
    return datetime.now(timezone.utc).isoformat()

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def normalized(url):
    p = urlparse(url)
    scheme = p.scheme or "https"
    host = (p.hostname or "").lower()
    port = f":{p.port}" if p.port and p.port not in (80, 443) else ""
    path = p.path or "/"
    query = urlencode(sorted(parse_qsl(p.query, keep_blank_values=True)))
    return urlunparse((scheme.lower(), host + port, path, "", query, ""))

def first_party(url):
    host = (urlparse(url).hostname or "").lower()
    return host in ASSET_HOSTS

def safe_name(url, suffix=""):
    p = urlparse(url)
    raw = (p.hostname or "asset") + (p.path or "/")
    if p.query:
        raw += "_" + p.query
    clean = re.sub(r"[^A-Za-z0-9._-]+", "_", raw).strip("_")
    if len(clean) > 190:
        clean = clean[:150] + "_" + hashlib.sha1(url.encode()).hexdigest()[:16]
    return clean + suffix

def get(url):
    last = None
    for attempt in range(3):
        try:
            r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
            return r
        except requests.RequestException as exc:
            last = exc
            time.sleep(1 + attempt)
    raise last

def save_remote(url, dest):
    r = get(url)
    dest.write_bytes(r.content)
    return r

def xml_locs(content):
    root = ET.fromstring(content)
    return [e.text.strip() for e in root.iter() if e.tag.endswith("loc") and e.text]

def discover_urls():
    robots = get(urljoin(SOURCE, "/robots.txt"))
    (SITEMAP_DIR / "robots.txt").write_bytes(robots.content)
    root = get(SITEMAP)
    (SITEMAP_DIR / "sitemap.xml").write_bytes(root.content)
    locs = xml_locs(root.content)
    page_urls = []
    for loc in locs:
        if loc.lower().endswith(".xml"):
            r = get(loc)
            name = Path(urlparse(loc).path).name or "child-sitemap.xml"
            (SITEMAP_DIR / name).write_bytes(r.content)
            page_urls.extend(xml_locs(r.content))
        else:
            page_urls.append(loc)
    return list(dict.fromkeys(normalized(u) for u in page_urls))

def provider_for(url):
    host = (urlparse(url).hostname or "").lower()
    for needle, provider in VIDEO_HOSTS.items():
        if host == needle or host.endswith("." + needle):
            return provider
    return None

def third_party_type(url):
    host = (urlparse(url).hostname or "").lower()
    for needle, kind in THIRD_PARTY_HINTS.items():
        if host == needle or host.endswith("." + needle):
            return kind
    return "external"

def template_family(url, title, h1s, soup):
    path = urlparse(url).path.lower()
    if path in ("", "/"):
        return "home"
    if any(x in path for x in ("request-appointment", "schedule", "contact", "patient-forms", "new-patient")):
        return "conversion"
    if any(x in path for x in ("meet-dr-", "meet-the", "about", "our-team", "office-tour")):
        return "about-team"
    if any(x in path for x in ("patient-info", "reviews", "blog", "news", "gallery", "financing")):
        return "patient-resource"
    if any(x in path for x in ("locations", "location", "areas-we-serve", "directions")):
        return "location"
    return "service-detail"

def collect_from_soup(page_url, soup):
    asset_refs = []
    internal_links = []
    third_party = []
    videos = []
    attrs = [
        ("img", "src"), ("img", "data-src"), ("img", "data-lazy-src"),
        ("img", "nitro-lazy-src"), ("img", "nitro-lazy-srcset"),
        ("source", "src"), ("source", "srcset"), ("video", "poster"),
        ("link", "href"), ("script", "src"), ("iframe", "src"),
        ("a", "href"), ("embed", "src"), ("object", "data"),
    ]
    for tag, attr in attrs:
        for el in soup.find_all(tag):
            raw = el.get(attr)
            if not raw or raw.startswith(("data:", "javascript:", "mailto:", "tel:", "#")):
                continue
            candidates = [part.strip().split()[0] for part in raw.split(",")] if attr in ("srcset", "nitro-lazy-srcset") else [raw]
            for candidate in candidates:
                absolute = normalized(urljoin(page_url, candidate))
                p = urlparse(absolute)
                if p.scheme not in ("http", "https"):
                    continue
                provider = provider_for(absolute)
                if provider and tag in ("iframe", "script", "embed", "video", "source", "a"):
                    videos.append({
                        "pageUrl": page_url, "provider": provider, "url": absolute,
                        "tag": tag, "attribute": attr, "originalMarkup": str(el),
                    })
                if first_party(absolute):
                    ext = Path(p.path).suffix.lower()
                    rel = (el.get("rel") or [])
                    is_asset = tag in ("img", "source", "video", "script", "embed", "object")
                    is_asset = is_asset or (tag == "link" and any(x in rel for x in ("stylesheet", "icon", "preload")))
                    is_asset = is_asset or ext in {
                        ".css", ".js", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico",
                        ".woff", ".woff2", ".ttf", ".otf", ".eot", ".pdf", ".doc", ".docx", ".xls", ".xlsx",
                    }
                    if is_asset:
                        asset_refs.append((absolute, page_url, f"{tag}[{attr}]"))
                    elif tag == "a":
                        internal_links.append(absolute)
                else:
                    third_party.append({
                        "pageUrl": page_url, "type": third_party_type(absolute),
                        "url": absolute, "tag": tag, "attribute": attr,
                        "originalMarkup": str(el) if tag in ("iframe", "script", "embed", "object") else None,
                    })
    for el in soup.select("[style]"):
        for raw in re.findall(r"url\([\"']?([^\"')]+)", el.get("style") or "", flags=re.I):
            absolute = normalized(urljoin(page_url, raw))
            if first_party(absolute):
                asset_refs.append((absolute, page_url, "inline-style"))
    for el in soup.select("[nitro-lazy-bg]"):
        absolute = normalized(urljoin(page_url, el.get("nitro-lazy-bg")))
        if first_party(absolute):
            asset_refs.append((absolute, page_url, "nitro-lazy-bg"))
    return asset_refs, internal_links, third_party, videos

def css_dependencies(css_url, content):
    text = content.decode("utf-8", "ignore")
    refs = []
    for raw in re.findall(r"url\(\s*[\"']?([^\"')]+)", text, flags=re.I):
        if raw.startswith(("data:", "#")):
            continue
        absolute = normalized(urljoin(css_url, raw))
        if first_party(absolute):
            refs.append((absolute, css_url, "css-url"))
    for raw in re.findall(r"@import\s+(?:url\()?\s*[\"']([^\"']+)", text, flags=re.I):
        absolute = normalized(urljoin(css_url, raw))
        if first_party(absolute):
            refs.append((absolute, css_url, "css-import"))
    return refs

def main():
    started = now()
    urls = discover_urls()
    pages = []
    all_assets = []
    all_third = []
    all_videos = []
    page_failures = []
    for i, url in enumerate(urls, 1):
        try:
            r = get(url)
            body = r.content
            local = HTML_DIR / safe_name(url, ".html")
            local.write_bytes(body)
            soup = BeautifulSoup(body, "html.parser")
            title = soup.title.get_text(" ", strip=True) if soup.title else ""
            desc_el = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
            canonical_el = soup.find("link", rel=lambda v: v and "canonical" in v)
            h1s = [h.get_text(" ", strip=True) for h in soup.find_all("h1")]
            asset_refs, links, third, videos = collect_from_soup(url, soup)
            all_assets.extend(asset_refs)
            all_third.extend(third)
            all_videos.extend(videos)
            pages.append({
                "sitemapUrl": url, "finalUrl": normalized(r.url), "status": r.status_code,
                "contentType": r.headers.get("content-type"), "bytes": len(body),
                "sha256": sha256(body), "localPath": str(local.relative_to(ROOT)),
                "title": title, "metaDescription": desc_el.get("content", "").strip() if desc_el else "",
                "canonical": normalized(canonical_el.get("href")) if canonical_el and canonical_el.get("href") else "",
                "h1Count": len(h1s), "h1s": h1s,
                "internalLinks": sorted(set(links)),
                "templateFamily": template_family(url, title, h1s, soup),
                "capturedAt": now(),
            })
            print(f"[{i}/{len(urls)}] {r.status_code} {url}")
        except Exception as exc:
            page_failures.append({"url": url, "error": repr(exc)})
            print(f"[{i}/{len(urls)}] FAIL {url}: {exc}")

    queue = list(dict.fromkeys((u, source, kind) for u, source, kind in all_assets))
    seen = {}
    failures = []
    failed_seen = {}
    index = 0
    while index < len(queue):
        url, source_page, kind = queue[index]
        index += 1
        if url in seen:
            seen[url]["referencedBy"].append({"source": source_page, "kind": kind})
            continue
        if url in failed_seen:
            failed_seen[url]["referencedBy"].append({"source": source_page, "kind": kind})
            continue
        try:
            r = get(url)
            ctype = (r.headers.get("content-type") or mimetypes.guess_type(url)[0] or "application/octet-stream").split(";")[0]
            if "text/html" in ctype:
                record = {
                    "url": url, "reason": "excluded-html-response", "status": r.status_code,
                    "referencedBy": [{"source": source_page, "kind": kind}],
                }
                failures.append(record)
                failed_seen[url] = record
                continue
            digest = sha256(r.content)
            filename = f"{digest[:12]}_{safe_name(url)}"
            local = ASSET_DIR / filename
            local.write_bytes(r.content)
            record = {
                "url": url, "finalUrl": normalized(r.url), "status": r.status_code,
                "contentType": ctype, "bytes": len(r.content), "sha256": digest,
                "localPath": str(local.relative_to(ROOT)),
                "referencedBy": [{"source": source_page, "kind": kind}],
            }
            seen[url] = record
            if ctype == "text/css" or urlparse(url).path.lower().endswith(".css"):
                queue.extend(css_dependencies(url, r.content))
        except Exception as exc:
            record = {
                "url": url, "reason": "download-error", "error": repr(exc),
                "referencedBy": [{"source": source_page, "kind": kind}],
            }
            failures.append(record)
            failed_seen[url] = record

    pages.sort(key=lambda p: p["sitemapUrl"])
    assets = sorted(seen.values(), key=lambda a: a["url"])
    unique_videos = {}
    for item in all_videos:
        unique_videos[(item["provider"], item["url"])] = {"provider": item["provider"], "url": item["url"]}
    unique_third = {}
    for item in all_third:
        unique_third[(item["type"], item["url"])] = {"type": item["type"], "url": item["url"]}
    families = Counter(p["templateFamily"] for p in pages)

    (MANIFEST_DIR / "pages.json").write_text(json.dumps(pages, indent=2))
    (MANIFEST_DIR / "assets.json").write_text(json.dumps(assets, indent=2))
    (MANIFEST_DIR / "asset-failures.json").write_text(json.dumps(failures, indent=2))
    (MANIFEST_DIR / "page-failures.json").write_text(json.dumps(page_failures, indent=2))
    (MANIFEST_DIR / "video-embeds.json").write_text(json.dumps(all_videos, indent=2))
    (MANIFEST_DIR / "video-embeds-unique.json").write_text(json.dumps(sorted(unique_videos.values(), key=lambda x: x["url"]), indent=2))
    (MANIFEST_DIR / "third-party-embeds.json").write_text(json.dumps(all_third, indent=2))
    (MANIFEST_DIR / "third-party-embeds-unique.json").write_text(json.dumps(sorted(unique_third.values(), key=lambda x: x["url"]), indent=2))
    (MANIFEST_DIR / "proposed-page-types.json").write_text(json.dumps({
        "families": [{"family": k, "count": v} for k, v in sorted(families.items())],
        "models": {
            "home": "homePage", "about-team": "standardPage/personPage",
            "service-detail": "servicePage", "patient-resource": "patientResourcePage",
            "conversion": "conversionPage", "location": "locationPage",
        },
    }, indent=2))
    with (MANIFEST_DIR / "urls.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sitemap_url", "final_url", "status", "canonical", "title", "h1_count", "template_family", "local_path"])
        for p in pages:
            w.writerow([p["sitemapUrl"], p["finalUrl"], p["status"], p["canonical"], p["title"], p["h1Count"], p["templateFamily"], p["localPath"]])
    summary = {
        "source": SOURCE, "startedAt": started, "completedAt": now(),
        "sitemapUrls": len(urls), "pagesCaptured": len(pages),
        "http200Pages": sum(p["status"] == 200 for p in pages),
        "non200Pages": sum(p["status"] != 200 for p in pages),
        "pageFailures": len(page_failures), "assetRecords": len(assets),
        "assetFailures": len(failures), "assetBytes": sum(a["bytes"] for a in assets),
        "videoEmbedOccurrences": len(all_videos), "uniqueVideoEmbedUrls": len(unique_videos),
        "hostedVideoFilesDownloaded": 0, "thirdPartyOccurrences": len(all_third),
        "uniqueThirdPartyUrls": len(unique_third), "templateFamilies": dict(families),
        "missingTitles": sum(not p["title"] for p in pages),
        "missingDescriptions": sum(not p["metaDescription"] for p in pages),
        "missingCanonicals": sum(not p["canonical"] for p in pages),
        "zeroH1Pages": sum(p["h1Count"] == 0 for p in pages),
        "multiH1Pages": sum(p["h1Count"] > 1 for p in pages),
    }
    (MANIFEST_DIR / "capture-summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
