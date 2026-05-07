# ChatGPT App Threat Model

## Assets

- SSH hostnames, aliases, usernames, and known-host fingerprints
- SSH private keys, passphrases, passwords, bearer tokens, cookies, and environment secrets
- remote command output
- local and remote files transferred through MCP tools
- policy files and audit logs

## Default Trust Boundary

The ChatGPT app profile must begin as read-only inspection. Chat text is not a safe channel for SSH secrets or private keys. Credential entry remains disabled unless the official OpenAI app platform provides a secure credential flow and the repository documents how that flow prevents transcript/log exposure.

## Required Controls

- strict host-key verification by default
- host allowlist before connections
- non-loopback HTTP refusal without bearer auth and allowed origins
- request-size limits on HTTP JSON bodies
- redaction for tokens, private keys, passwords, passphrases, and cookies
- no raw command execution by default
- policy allow and explicit user confirmation for mutations
- audit records for policy decisions and risky operations
- legacy SSE disabled by default

## Mutation Classes

| Class | Examples | Required controls |
|-------|----------|-------------------|
| Read-only | host discovery, session listing, OS detection, file reads | allowlist, host-key verification, output truncation/redaction |
| Mutation | command execution, file writes, transfers, package/service changes, tunnels | policy allow plus explicit confirmation |
| Destructive | recursive delete, destructive shell commands, raw sudo | explicit policy allow, explicit confirmation, audit event, deny by default |

## Submission Risks

The app must be rejected locally if `publishReady=true` without a public HTTPS endpoint, dashboard setup, domain verification, CSP configuration, privacy review, screenshots, and review test cases. `scripts/validate-chatgpt-app.mjs` enforces this fail-fast posture.
