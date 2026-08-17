# Lowen Tab 8 validation

Read-only gates for Dom's final Lowen feedback. They do not write to Directus, deploy, capture Beaverton, or replace the existing source-region, route-matrix, visual-fidelity and Jeffrey regression gates.

```bash
python3 poc/lowen-tab8-validation/tab8_gate.py --fixture-only
python3 poc/lowen-tab8-validation/tab8_gate.py --diagnostic --output /tmp/lowen-tab8-baseline.json
python3 poc/lowen-tab8-validation/tab8_gate.py
python3 poc/lowen-tab8-validation/validate_director_comparison.py comparison.json
```

The current baseline is expected to fail the focused mapping checks. `--diagnostic` records that state without turning discovery into a release pass. A release requires the normal gate to exit zero as well as all existing Final B gates.
