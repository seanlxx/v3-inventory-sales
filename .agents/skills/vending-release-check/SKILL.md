---
name: vending-release-check
description: Use when verifying, reviewing, or preparing changes for the vending-inventory-sales repository, especially Cloudflare Pages, D1 migrations, static frontend, AI proxy, release, commit, or deployment workflow tasks.
---

# Vending Inventory Release Check

Use this skill for this repository's pre-commit and pre-deploy workflow.

## Required Orientation

1. Read `AGENTS.md` first and follow its stricter rules.
2. Run `git status --short` before touching files.
3. Do not read or edit `dist/`, `.wrangler/`, `.sisyphus/`, `.openacp/`, `.env*`, recovery codes, D1 seed/export files, or backup JSON files unless the user explicitly asks.
4. State the intended file scope before editing.

## Verification Matrix

- Frontend source changes in `index.html`, `css/`, or `js/`: run `powershell -ExecutionPolicy Bypass -File ./scripts/build.ps1` and `powershell -ExecutionPolicy Bypass -File ./scripts/test.ps1`.
- Cloudflare Function changes in `functions/api/`: run `powershell -ExecutionPolicy Bypass -File ./scripts/test.ps1`; use `scripts/dev.ps1` only when route/binding behavior needs manual local verification.
- Migration changes in `migrations/`: run `npx wrangler d1 migrations apply vending-inventory-sales-db --local`.
- Documentation-only changes: do not run build or start the dev server unless the user asks.

## Review Focus

- Keep changes narrow and avoid unrelated refactors.
- Check auth/session behavior before changing API routes.
- Check D1 JSON record shape and index columns before changing business data.
- Check R2 image metadata and chunk handling before changing image upload paths.
- Check AI provider routing, server-side key handling, and prompt/schema contracts before changing AI features.

## Finish

If files changed and verification passed, follow the repository deployment rule: stage, commit with a concise Chinese message, and push to `origin master`. Report touched files, verification result, commit hash, push summary, and any avoidable extra operations.
