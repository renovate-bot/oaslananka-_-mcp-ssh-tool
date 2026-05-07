import { describe, expect, test } from "@jest/globals";
import {
  corsHeaders,
  isLoopbackHost,
  isOriginAllowed,
  validateHttpStartupConfig,
} from "../../src/http-security.js";

describe("HTTP transport security guards", () => {
  test("accepts loopback startup without bearer token", () => {
    expect(() =>
      validateHttpStartupConfig(
        {
          host: "127.0.0.1",
          allowedOrigins: ["http://127.0.0.1", "http://localhost"],
        },
        undefined,
      ),
    ).not.toThrow();
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
  });

  test("rejects non-loopback startup without bearer token and origins", () => {
    expect(() =>
      validateHttpStartupConfig(
        {
          host: "0.0.0.0",
          allowedOrigins: [],
        },
        undefined,
      ),
    ).toThrow("Refusing non-loopback HTTP MCP binding");
  });

  test("rejects empty bearer token files", () => {
    expect(() =>
      validateHttpStartupConfig(
        {
          host: "0.0.0.0",
          allowedOrigins: ["https://chatgpt.com"],
          bearerTokenFile: "/tmp/token",
        },
        "",
      ),
    ).toThrow("empty bearer token file");
  });

  test("allows non-loopback startup only with bearer token and origins", () => {
    expect(() =>
      validateHttpStartupConfig(
        {
          host: "0.0.0.0",
          allowedOrigins: ["https://chatgpt.com"],
          bearerTokenFile: "/tmp/token",
        },
        "secret",
      ),
    ).not.toThrow();
  });

  test("applies origin allowlist and CORS headers", () => {
    const origins = ["https://chatgpt.com"];

    expect(isOriginAllowed("https://chatgpt.com", origins)).toBe(true);
    expect(isOriginAllowed("https://evil.example", origins)).toBe(false);
    expect(corsHeaders("https://chatgpt.com", origins)).toEqual(
      expect.objectContaining({
        "Access-Control-Allow-Origin": "https://chatgpt.com",
        Vary: "Origin",
      }),
    );
    expect(corsHeaders("https://evil.example", origins)).toEqual({});
  });
});
