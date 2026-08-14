# Clean factory repository rules

- This is a clean benchmark. Do not read or copy the historical three-page Jeffrey Carl proof implementation.
- The only migration input is source-freeze/ plus FACTORY-CONTRACT.md.
- Kimi K3 is the migration agent. It may implement and repair but may not weaken or author the independent auditor acceptance criteria.
- Preserve source content exactly. Never invent copy or unconditional CTA material.
- Render all pages from native Directus page/template/block relationships; no whole-page HTML or JSON content blobs.
- Keep the target noindexed. Never modify the live source, DNS, production forms, analytics or indexing.
- Never commit secrets.
- Record timing and benchmark metrics in machine-readable receipts.

## Implementation layout (Kimi migration pass)

- `scripts/extract.py` — deterministic extractor: source-freeze → `site/src/content/frozen/*.json` + `site/public/assets/*` + `receipts/extraction-receipt.json`. Re-run must be byte-identical (CI enforces).
- `scripts/serve.mjs` — static review server for `site/dist`, preserves legacy `.asp` paths, sets `X-Robots-Tag: noindex`.
- `scripts/directus_import.mjs` — idempotent import into the clean WEO master (`--dry-run` supported; needs `DIRECTUS_SERVER_TOKEN`).
- `scripts/build_receipt.mjs` — writes `receipts/build-receipt.json`.
- `site/` — Astro 5 project. `src/lib/contracts.ts` is the shared typed contract; `src/lib/directus.ts` (server-only token) and `src/lib/frozen.ts` (fallback) both satisfy it. Six family layouts in `src/layouts/`, twelve block modules in `src/components/blocks/`, dynamic legacy route `src/pages/p/[slug].astro`.
- `site/tests/` — vitest: block contracts, route count, provenance, structural relationships, noindex, build output. Run `npm run build` before `npm test`.
- `docs/OPERATOR.md` — operator runbook.

Verify before done: `python3 scripts/extract.py` (reconciliation green), `cd site && npm run build && npm test`, then `node scripts/serve.mjs` + `python3 auditor/audit_rendered.py --target http://127.0.0.1:4321 --strict` (78/78).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **jeffrey-carl-directus-factory** (2057 symbols, 4289 relationships, 134 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/jeffrey-carl-directus-factory/context` | Codebase overview, check index freshness |
| `gitnexus://repo/jeffrey-carl-directus-factory/clusters` | All functional areas |
| `gitnexus://repo/jeffrey-carl-directus-factory/processes` | All execution flows |
| `gitnexus://repo/jeffrey-carl-directus-factory/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
