# Safety And Bootstrap

## V3 Resource Boundary

Use the copied repository workflow, but isolate every runtime resource:

| Resource | Required v3 target |
| --- | --- |
| GitHub repo | `v3-inventory-sales` or another explicit v3 repo |
| Cloudflare Pages | new v3 Pages project |
| D1 | new v3 D1 database |
| R2 | new v3 R2 bucket |

Before database work, verify:

```powershell
git remote -v
Get-Content -Raw .\wrangler.jsonc
```

The remote must not be the v2 repo, and `wrangler.jsonc` must not point at v2 D1/R2 resource names.

## Local Export Directory

Migration exports should go under `.migration/` or another ignored local directory.

Before creating export files, confirm `.gitignore` contains:

```gitignore
.migration/
```

Never commit:

- v2 D1 exports
- generated migration JSON
- reconciliation files with business details
- image base64
- recovery codes
- API keys or tokens

## Migration Numbering Decision

If the v3 repository is copied from v2, decide one of these before writing migrations:

| Option | Meaning |
| --- | --- |
| Keep 0001-0004 | New v3 D1 also has legacy `vending_records` tables for migration/compatibility |
| Reset to clean 0001 | v3 D1 starts with only the structured schema |

Do not mix both assumptions. If keeping 0001-0004, document old tables as temporary compatibility tables.

## Rollback Boundary

Rollback means discarding v3 resources or v3 imported data. Do not write automatic sync back to v2.
