# Operations

## Repository Operations

- Canonical source and release boundary: `https://github.com/oaslananka-lab/mcp-ssh-tool`
- Personal showcase mirror: `https://github.com/oaslananka/mcp-ssh-tool`
- Local remotes may differ by checkout; push PR branches to the org remote.

Create release hardening branches from org `main`:

```bash
git switch -c chore/v2.1.2-hardening
git push -u lab chore/v2.1.2-hardening
```

The personal mirror is updated only by `mirror-personal.yml`, which defaults to dry-run and mirrors org `main` plus `v*.*.*` tags.

## Runtime Operations

Prefer stdio for local MCP clients. Use Streamable HTTP only when a remote client or reverse proxy requires HTTP, and keep HTTP bound to loopback unless bearer auth and allowed origins are configured.

Before privileged or destructive host changes:

1. Open a strict host-key session.
2. Inspect `mcp-ssh-tool://policy/effective`.
3. Use `policyMode: "explain"` for mutation planning.
4. Prefer `ensure_*` tools over raw `proc_sudo`.
5. Close sessions and tunnels when finished.

## Generated Files

Cleanup is dry-run by default:

```bash
bash scripts/repo-cleanup.sh
```

Only maintainers should run:

```bash
bash scripts/repo-cleanup.sh --apply
```
