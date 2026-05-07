# Client Configs

## ChatGPT Developer Mode

Use stdio for local MCP clients. For ChatGPT app developer testing, use a public HTTPS MCP endpoint only after auth/origin controls are configured.

## Claude Desktop

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "command": "mcp-ssh-tool",
      "args": []
    }
  }
}
```

## VS Code, Cursor, and Codex

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

## Streamable HTTP

```bash
printf '%s' 'dev-only-token' > .mcp-token
mcp-ssh-tool --transport=http --host 127.0.0.1 --port 3000 --bearer-token-file .mcp-token
```

Remote HTTP deployments must set:

```bash
SSH_MCP_HTTP_BEARER_TOKEN_FILE=/run/secrets/mcp-token
SSH_MCP_HTTP_ALLOWED_ORIGINS=https://your-client.example
SSH_MCP_ALLOWED_HOSTS=prod-1,prod-2
```

Legacy SSE is disabled by default and should be used only for temporary compatibility.
