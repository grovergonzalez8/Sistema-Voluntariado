---
name: database-migration-review
description: Review Sistema-Voluntariado PostgreSQL/Supabase migrations for RLS, grants, functions, triggers, indexes, integrity, and personal-data exposure. Use whenever migrations, seeds, SQL tests, policies, or database permissions change; do not use as a substitute for product-rule approval or application tests.
---

# Database Migration Review

Operate in read-only review mode unless fixes are explicitly requested. Never target a remote database.

## Inputs

- Migration and seed diff.
- Related pgTAP tests.
- Threat model, data dictionary, and Supabase `AGENTS.md`.

## Steps

1. Confirm the schema implements only approved entities and constraints.
2. Check RLS is enabled with deny-by-default behavior on every exposed table.
3. Separate row authorization from column privileges; inspect all grants.
4. Review `security definer` functions for `search_path = ''`, qualified names, trusted actor derivation, and minimum execute grants.
5. Inspect triggers, indexes, foreign-key deletion behavior, audit payloads, and seed locality.
6. Run `corepack pnpm exec supabase db lint --local --level warning` and `corepack pnpm db:test` when local Docker is available.
7. Verify tests cover anonymous denial, horizontal access, allowed/protected updates, privilege escalation, archived records, and audit visibility.

## Output

- Findings ordered critical to low with SQL evidence.
- RLS/grant test matrix.
- Executed commands, failures, and exact rerun commands.

Never treat mocks as proof that RLS works.
