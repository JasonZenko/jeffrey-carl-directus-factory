#!/usr/bin/env python3
"""Capture Lowen Perio with the canonical read-only WEO capture engine."""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path
from urllib.parse import urlparse

POC_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = POC_ROOT.parents[1]
ENGINE_PATH = REPO_ROOT / "source-freeze" / "scripts" / "capture.py"

spec = importlib.util.spec_from_file_location("foundry_capture_engine", ENGINE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load capture engine: {ENGINE_PATH}")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

engine.ROOT = POC_ROOT / "source-freeze"
engine.CAPTURE = engine.ROOT / "capture"
engine.HTML_DIR = engine.CAPTURE / "html"
engine.ASSET_DIR = engine.CAPTURE / "assets"
engine.SITEMAP_DIR = engine.CAPTURE / "sitemaps"
engine.MANIFEST_DIR = engine.ROOT / "manifests"
engine.SOURCE = "https://www.lowenperio.com/"
engine.session.headers.update({"User-Agent": "FoundryWorks-PearlMigrationCapture/1.0 (+read-only source preservation)"})
for directory in (engine.HTML_DIR, engine.ASSET_DIR, engine.SITEMAP_DIR, engine.MANIFEST_DIR):
    directory.mkdir(parents=True, exist_ok=True)

SOURCE_HOSTS = {"lowenperio.com", "www.lowenperio.com"}


def first_party(url: str) -> bool:
    return (urlparse(url).hostname or "").lower() in SOURCE_HOSTS


def template_family(url: str, title: str, h1s: list[str], soup) -> str:
    route = urlparse(url).path.lower()
    evidence = " ".join([title, *h1s]).lower()
    if route in ("", "/") or re.search(r"-home-p\d+\.asp$", route):
        return "home"
    if any(token in route for token in ("request-appointment", "contact-us", "patient-forms", "refer-a-patient")):
        return "conversion"
    if any(token in route for token in ("meet-dr-", "about-us", "our-office", "our-team", "office-tour")):
        return "about-team"
    if any(token in route for token in ("patient-info", "reviews", "enewsletter", "post-op", "instructions")):
        return "patient-resource"
    if "location" in evidence or "directions" in evidence:
        return "location"
    return "service-detail"


engine.first_party = first_party
engine.template_family = template_family

if __name__ == "__main__":
    engine.main()
