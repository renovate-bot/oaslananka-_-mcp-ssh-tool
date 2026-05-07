# Jules Automation

`jules-ci-autofix.yml` is guarded maintenance automation for the org repository only.

## Modes

| Mode | Trigger | Purpose |
|------|---------|---------|
| CI failure | manual dispatch with a failed/timed-out `run_id` | Repair a failing non-publish workflow run. |
| Dependency | manual dispatch | Apply safe dependency maintenance after inspection. |
| Issue | `jules` issue label or manual issue number | Work only on trusted-author issues. |

## Guards

- exact org repository guard
- no fork head repositories
- no automatic `workflow_run` secret-bearing trigger
- no publish or release workflow repair
- no Jules loop branches
- trusted issue author allowlist through `JULES_TRUSTED_AUTHORS`
- no unconditional auto-approve
- no auto-merge
- no package publish, MCP Registry publish, release, mirror, or secret-management operations

Required secret:

```text
JULES_API_KEY
```

Jules-generated PRs must still pass the normal org CI/security gates before merge.
