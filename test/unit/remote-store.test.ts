import { describe, expect, test } from "@jest/globals";
import { createAgentPolicy } from "../../src/remote/policy.js";
import { RemoteStore } from "../../src/remote/store.js";

const now = "2026-01-01T00:00:00.000Z";

describe("remote durable store", () => {
  test("enforces single-use authorization codes atomically", () => {
    const store = new RemoteStore(":memory:");
    store.insertAuthorizationCode({
      id: "code_row",
      codeHash: "code_hash",
      clientId: "cli_test",
      userId: "usr_test",
      redirectUri: "https://example.com/callback",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      resource: "https://example.com/mcp",
      scope: "hosts:read",
      expiresAt: "2026-01-01T00:05:00.000Z",
      createdAt: now,
    });

    store.markAuthorizationCodeUsed("code_hash", now);

    let conflict: unknown;
    try {
      store.markAuthorizationCodeUsed("code_hash", now);
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toMatchObject({
      code: "INVALID_TOKEN",
      message: "Authorization code already used",
      status: 400,
    });
    store.close();
  });

  test("enforces single-use enrollment tokens atomically", () => {
    const store = new RemoteStore(":memory:");
    store.insertEnrollmentToken({
      id: "enr_test",
      agentId: "agt_test",
      userId: "usr_test",
      tokenHash: "token_hash",
      expiresAt: "2026-01-01T00:05:00.000Z",
      createdAt: now,
    });

    store.markEnrollmentTokenUsed("token_hash", now);

    let conflict: unknown;
    try {
      store.markEnrollmentTokenUsed("token_hash", now);
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toMatchObject({
      code: "INVALID_TOKEN",
      message: "Enrollment token already used",
      status: 400,
    });
    store.close();
  });

  test("counts registered OAuth clients for DCR bounding", () => {
    const store = new RemoteStore(":memory:");
    expect(store.countOAuthClients()).toBe(0);

    store.insertClient({
      id: "row_cli",
      clientId: "cli_test",
      clientName: "Test Client",
      redirectUris: ["https://example.com/callback"],
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      createdAt: now,
    });

    expect(store.countOAuthClients()).toBe(1);
    store.insertAgent({
      id: "agt_test",
      userId: "usr_test",
      alias: "local-test",
      status: "pending",
      profile: "read-only",
      policy: createAgentPolicy("read-only"),
      policyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    expect(store.countOAuthClients()).toBe(1);
    store.close();
  });
});
