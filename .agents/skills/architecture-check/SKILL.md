---
name: architecture-check
description: Review Sistema-Voluntariado module boundaries, dependency direction, public APIs, and Clean Architecture rules. Use for architecture reviews, new imports, new modules, cross-layer changes, or before integrating a vertical slice; do not use for database-only security review or formatting.
---

# Architecture Check

Review without modifying files unless the caller explicitly requests fixes.

## Inputs

- Changed files or diff.
- Applicable `AGENTS.md` and ExecPlan.
- `docs/architecture/module-boundaries.md` and dependency rules.

## Steps

1. Map each changed source file to domain, application, infrastructure, presentation, app composition, or shared code.
2. Trace imports and confirm dependencies point inward.
3. Verify Supabase imports occur only in infrastructure and composition uses module public APIs.
4. Detect internal cross-module imports, framework leakage, empty abstractions, duplicated contracts, and premature modules.
5. Run `corepack pnpm lint:boundaries` and report the real result.
6. Return findings ordered by impact with file/line evidence and the smallest safe correction.

## Output

- Verdict: pass, pass with observations, or fail.
- Actionable findings with evidence.
- Commands executed and any unverified assumption.

Do not approve a boundary based only on directory names; inspect imports and behavior.
