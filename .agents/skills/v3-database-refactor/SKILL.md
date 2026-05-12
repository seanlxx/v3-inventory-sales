---
name: v3-database-refactor
description: "Use when working on this vending project's v3 database refactor: copying v2 into a new v3 GitHub repository, switching Cloudflare Pages/D1/R2 resources, designing or reviewing structured D1 migrations, implementing inventory ledger APIs, transforming v2 JSON records into v3 tables, writing migration/import/verification scripts, or checking reconciliation and rollback safety."
---

# V3 Database Refactor

Use this skill to keep the v3 database rewrite aligned with the project plan and the actual v2 data shape.

## First Checks

1. Read `AGENTS.md` first and obey its stricter repository rules.
2. Run `git status --short`; if the directory is not a Git repository, report that before promising commit/push.
3. Do not read `.wrangler/`, `dist/`, `.openacp/`, `.env*`, backup JSON, D1 export SQL, or image row dumps unless explicitly required.
4. State the intended file scope before editing.

## Reference Selection

Load only the relevant reference file:

- `references/safety-and-bootstrap.md`: when copying the repo, switching remotes/resources, handling `.migration/`, or planning rollback.
- `references/v2-field-map.md`: when writing v2 export/transform code or reviewing mappings from `vending_records`.
- `references/v3-schema-ledger.md`: when writing migrations, service-layer inventory logic, or D1 table/API contracts.
- `references/verification.md`: when writing tests, reconciliation SQL, dry-run imports, or release checks.

## Core Rules

- Treat v3 as a copied codebase with new Cloudflare resources: same engineering workflow, different GitHub repo, Pages project, D1 database, and R2 bucket.
- Never write to the v2 production D1/R2 from a v3 migration/import script.
- Keep money in integer cents in v3 (`*_cents` fields). Convert v2 decimal money with `Math.round(value * 100)`.
- Keep inventory quantity as integer units for now.
- Use `stock_movements` as the only trusted inventory ledger; `inventory_balances` is a cache that must be rebuildable from movements.
- Preserve history by voiding documents with reverse movements, not by hard-deleting business records.
- Treat products as archived/inactive instead of deleting when history exists.
- Store images in R2; D1 should store only R2 keys and metadata in v3.

## Implementation Workflow

1. Confirm `git remote -v` points at the v3 repository before changing deployment or database config.
2. Confirm `wrangler.jsonc` points at v3 D1/R2 resources before running migrations or imports.
3. Ensure `.migration/` or any chosen local export directory is ignored before generating data files.
4. Decide whether v3 keeps copied 0001-0004 migrations as legacy compatibility tables or resets to a clean v3 schema. Document that decision before adding migration files.
5. Implement schema before import code.
6. Implement export/transform/import as separate scripts; make import default to `--dry-run`.
7. Generate reconciliation output before applying any adjustment rows.
8. Only adapt frontend/API calls after the service layer passes focused inventory tests.

## Common Traps

- Do not map v2 purchase cost from `unitCost`/`totalCost`; v2 uses `unitPrice`/`totalPrice`.
- Do not treat every v2 sales record as `sale`; v2 uses `daily`, `refund`, and `loss`.
- Do not preserve negative refund quantities in v3 `sales_items.quantity`; use positive business quantity and encode direction in order type plus stock movement delta.
- Do not trust `products.currentStock` as a source ledger; use it only as a reconciliation target.
- Do not commit migration exports, reconciliation data with business details, image manifests containing sensitive paths, or base64 image content.
