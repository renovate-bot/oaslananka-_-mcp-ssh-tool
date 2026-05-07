export interface HttpStartupConfig {
  host: string;
  allowedOrigins: string[];
  bearerTokenFile?: string;
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function validateHttpStartupConfig(
  httpConfig: HttpStartupConfig,
  bearerToken: string | undefined,
): void {
  if (httpConfig.bearerTokenFile && bearerToken?.length === 0) {
    throw new Error("Refusing HTTP MCP startup with an empty bearer token file");
  }

  if (isLoopbackHost(httpConfig.host)) {
    return;
  }

  if (!bearerToken || httpConfig.allowedOrigins.length === 0) {
    throw new Error(
      "Refusing non-loopback HTTP MCP binding without SSH_MCP_HTTP_BEARER_TOKEN_FILE and SSH_MCP_HTTP_ALLOWED_ORIGINS",
    );
  }
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  return !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin);
}

export function corsHeaders(
  origin: string | undefined,
  allowedOrigins: string[],
): Record<string, string> {
  if (!origin || !isOriginAllowed(origin, allowedOrigins)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "mcp-session-id",
    Vary: "Origin",
  };
}
