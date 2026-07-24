---
name: release-readiness
description: Verify Sistema-Voluntariado integration readiness by running repository quality gates, database tests, E2E, secret/prohibited-pattern scans, and documentation checks. Use before commits, pull requests, releases, or ExecPlan closure; do not use to deploy or bypass a failed gate.
---

# Release Readiness

Report evidence; do not claim a gate passed unless its command completed successfully.

## Inputs

- Current diff and Git status.
- Active ExecPlan and Definition of Done.
- Local Docker/browser availability.

## Steps

1. Confirm branch, Node `22.18.0`, pnpm `11.9.0`, lockfile, and clean dependency install.
2. Run `corepack pnpm verify`.
3. Run `corepack pnpm db:test` against Supabase local and `corepack pnpm test:e2e`.
4. Review the complete diff and run repository scans for secrets, `service_role` in frontend, `any`, `@ts-ignore`, lint suppressions, TODO and FIXME.
5. Check documented commands exist and README steps match scripts.
6. Summarize each gate as passed, failed, or not executed, including the exact reason and rerun command.

## Output

- Gate table with command and observed result.
- Blocking findings and residual risks.
- Commit/release recommendation.

Never deploy, push, rewrite history, or change global configuration.
