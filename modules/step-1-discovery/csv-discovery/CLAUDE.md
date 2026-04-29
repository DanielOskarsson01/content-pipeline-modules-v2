# CLAUDE.md — csv-discovery

## What this module does
Reads CSV files from a local directory and emits pipeline items. No network I/O — purely filesystem-based discovery.

## Key contracts
- Output items MUST have `url`, `externalId`, `source`, `status` fields (pipeline contract)
- LinkedIn URLs get numeric ID extracted for `externalId` (e.g., `linkedin-1234567890`)
- `text_content` is set when snippet exceeds 200 chars (same pattern as api-search)
- `.processed` file tracks which CSVs have been consumed — prevents re-processing

## When modifying
- Keep the built-in CSV parser dependency-free (no Papa Parse etc.)
- Column mapping is case-insensitive (headers lowercased before lookup)
- All entities receive the same items (CSV is entity-agnostic)
- Must push `_partialItems` for timeout resilience (rule 10)
