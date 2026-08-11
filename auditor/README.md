# Independent migration fidelity auditor

This directory is outside the Kimi migration pass. It owns the immutable source contract and the fail-closed route receipts.

The migration agent may read a failed receipt and repair its implementation. It must not modify these acceptance criteria or certify its own work.

Commands:

    python3 auditor/compare_freezes.py
    python3 auditor/build_source_contract.py
    python3 auditor/audit_rendered.py --target http://127.0.0.1:4321 --strict
