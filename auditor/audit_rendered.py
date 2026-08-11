#!/usr/bin/env python3
"""Independent fail-closed frozen-source versus rendered-route auditor."""

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "auditor" / "source-contract.json"
RESULTS = ROOT / "auditor" / "fidelity-results.json"
HTTP = requests.Session()
HTTP.mount(
    "https://",
    HTTPAdapter(max_retries=Retry(
        total=5,
        backoff_factor=0.4,
        status_forcelist=(500, 502, 503, 504, 522, 523, 524),
        allowed_methods=("GET", "HEAD"),
    )),
)


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


def fetch_digest(url):
    response = HTTP.get(url, timeout=30)
    response.raise_for_status()
    return hashlib.sha256(response.content).hexdigest()


parser = argparse.ArgumentParser()
parser.add_argument("--target", required=True)
parser.add_argument("--strict", action="store_true")
args = parser.parse_args()
target = args.target.rstrip("/")
contract = json.loads(CONTRACT.read_text())
results = []

for expected in contract["contracts"]:
    url = urljoin(target + "/", expected["route"].lstrip("/"))
    try:
        response = HTTP.get(url, timeout=40, headers={"Cache-Control": "no-cache"})
        status = response.status_code
        soup = BeautifulSoup(response.content, "html.parser")
        root = soup.select_one("[data-fidelity-root]")
        if root is None:
            raise RuntimeError("missing [data-fidelity-root]")
        for ignored in root.select("script,style,noscript,template"):
            ignored.decompose()
        articles = root.select("[data-source-article]")
        actual = {
            "article_ids": [node.get("data-source-article") for node in articles],
            "article_text": [normalize_text(node.get_text(" ", strip=True)) for node in articles],
            "headings": [
                {"level": node.name.lower(), "text": normalize_text(node.get_text(" ", strip=True))}
                for node in root.find_all(re.compile(r"^h[1-6]$"))
                if normalize_text(node.get_text(" ", strip=True))
            ],
            "links": [
                {
                    "label": normalize_text(node.get_text(" ", strip=True)),
                    "href": normalize_url(node.get("href"), expected["source_url"]),
                    "target": node.get("target") or "",
                }
                for node in root.find_all("a", href=True)
            ],
            "images": [
                {
                    "alt": normalize_text(node.get("alt")),
                    "sha256": fetch_digest(urljoin(url, node.get("src"))),
                }
                for node in root.find_all("img", src=True)
            ],
            "embeds": [
                normalize_url(node.get("src"), expected["source_url"])
                for node in root.find_all(["iframe", "embed"], src=True)
            ],
        }
        description = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
        canonical = soup.find("link", attrs={"rel": lambda value: value and "canonical" in value})
        actual["metadata"] = {
            "title": normalize_text(soup.title.get_text(" ", strip=True) if soup.title else ""),
            "description": normalize_text(description.get("content") if description else ""),
            "canonical": normalize_url(canonical.get("href") if canonical else "", expected["source_url"]),
        }
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
        results.append({
            "route": expected["route"],
            "family": expected["family"],
            "status": status,
            "pass": status == 200 and all(checks.values()),
            "checks": checks,
            "expected": expected,
            "actual": actual,
        })
    except Exception as error:
        results.append({
            "route": expected["route"],
            "family": expected["family"],
            "status": locals().get("status"),
            "pass": False,
            "error": str(error),
        })

receipt = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "target": target,
    "routes": len(results),
    "passed": sum(item["pass"] for item in results),
    "failed": sum(not item["pass"] for item in results),
    "results": results,
}
RESULTS.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({
    "target": target,
    "routes": receipt["routes"],
    "passed": receipt["passed"],
    "failed": receipt["failed"],
    "failed_routes": [item["route"] for item in results if not item["pass"]],
}, indent=2))
if args.strict and receipt["failed"]:
    raise SystemExit(1)
