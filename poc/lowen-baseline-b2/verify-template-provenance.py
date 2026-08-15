#!/usr/bin/env python3
"""Fail unless B2 descends from the exact Pearl template Dom approved."""

import json
import subprocess
import sys
from pathlib import Path

APPROVED_TEMPLATE_SHA = "dd84730513393f29e385c86ab8117a32ce2f6d76"
ROOT = Path(__file__).resolve().parents[2]
RECEIPT = Path(__file__).with_name("template-provenance.json")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


head = git("rev-parse", "HEAD")
subject = git("show", "-s", "--format=%s", APPROVED_TEMPLATE_SHA)
ancestor = subprocess.run(
    ["git", "merge-base", "--is-ancestor", APPROVED_TEMPLATE_SHA, head],
    cwd=ROOT,
    check=False,
).returncode == 0
receipt = {
    "ok": ancestor,
    "approved_template_sha": APPROVED_TEMPLATE_SHA,
    "approved_template_subject": subject,
    "release_sha": head,
    "approved_template_is_ancestor": ancestor,
}
RECEIPT.parent.mkdir(parents=True, exist_ok=True)
RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
if not ancestor:
    sys.exit("B2 is not descended from Dom's approved Pearl template commit")
