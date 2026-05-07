# ChatGPT App Readiness

This repository contains a ChatGPT app readiness scaffold under `apps/chatgpt/`. It is not a production app manifest and it does not publish an app.

As of the current OpenAI Apps SDK documentation, app submission is a dashboard review flow that requires a public HTTPS MCP server URL, organization/app verification, tool descriptor review, component CSP metadata when widgets are used, screenshots, review test cases, support/privacy URLs, and working auth if the app requires credentials.

## Current Status

| Area | Status |
|------|--------|
| MCP package | Ready as local stdio package `mcp-ssh-tool` |
| Streamable HTTP | Available, loopback by default |
| Public HTTPS backend | Not configured |
| App dashboard setup | Not configured |
| Domain verification | Not configured |
| Widget/component bundle | Not configured |
| App publish workflow | Not present |
| Validator | `npm run validate:chatgpt-app` |

`apps/chatgpt/app-readiness.json` intentionally sets `publishReady` to `false`.

## Security Model

Default ChatGPT app behavior must be read-only inspection:

- no SSH private keys in chat
- no passphrases, passwords, bearer tokens, or cookies in chat
- host allowlist required
- strict host-key verification default
- user-managed SSH config/policy preferred
- no raw command execution by default
- no `proc_sudo` by default
- no file writes, transfers, tunnels, package changes, service changes, or destructive filesystem operations without policy allow and explicit user confirmation
- non-loopback HTTP requires bearer auth and allowed origins
- tool output must not expose credentials or policy secrets

## Local Development Shape

Local MCP stdio:

```json
{
  "servers": {
    "ssh-mcp": {
      "type": "stdio",
      "command": "mcp-ssh-tool",
      "args": []
    }
  }
}
```

Local Streamable HTTP for development:

```bash
printf '%s' 'dev-only-token' > .mcp-token
mcp-ssh-tool --transport=http --host 127.0.0.1 --port 3000 --bearer-token-file .mcp-token
```

Do not expose a public ChatGPT connector to localhost. For ChatGPT developer testing, use a public HTTPS endpoint or tunnel only after configuring bearer auth, allowed origins, request-size limits, redaction, and host allowlists.

## Production Checklist

Before setting `publishReady=true`:

- create a public HTTPS MCP endpoint
- configure bearer auth or the official secure credential flow required by OpenAI
- configure allowed origins and component CSP
- provide support, privacy, and terms URLs
- provide app icon, screenshots, review test prompts, and expected responses
- verify tool annotations match actual behavior
- verify no credentials appear in `structuredContent`, `content`, `_meta`, widget state, logs, or audit exports
- run `npm run validate:chatgpt-app`

If OpenAI publishing requirements change, update this document and the validator before adding publish automation.
