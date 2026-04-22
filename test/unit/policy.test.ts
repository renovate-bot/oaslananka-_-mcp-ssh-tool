import { describe, expect, jest, test } from "@jest/globals";
import { PolicyEngine, type PolicyConfig } from "../../src/policy.js";

function policy(overrides: Partial<PolicyConfig> = {}) {
  return new PolicyEngine({
    mode: "enforce",
    allowRootLogin: false,
    allowRawSudo: false,
    allowDestructiveCommands: false,
    allowDestructiveFs: false,
    allowedHosts: [],
    commandAllow: [],
    commandDeny: [],
    pathAllowPrefixes: ["/tmp"],
    pathDenyPrefixes: ["/etc/shadow"],
    ...overrides,
  });
}

describe("PolicyEngine", () => {
  test("denies root login and raw sudo by default", () => {
    const engine = policy();

    expect(() =>
      engine.assertAllowed({
        action: "ssh.open",
        host: "example.com",
        username: "root",
      }),
    ).toThrow("Root SSH login is disabled by policy");

    expect(() =>
      engine.assertAllowed({
        action: "proc.sudo",
        command: "id",
        rawSudo: true,
      }),
    ).toThrow("Raw sudo command execution is disabled by policy");
  });

  test("enforces host, command, and path allow/deny controls", () => {
    const engine = policy({
      allowedHosts: ["^prod-[0-9]+\\.example\\.com$"],
      commandDeny: ["shutdown"],
    });

    expect(() =>
      engine.assertAllowed({
        action: "ssh.open",
        host: "dev.example.com",
        username: "deploy",
      }),
    ).toThrow("not allowed by policy");

    expect(() =>
      engine.assertAllowed({
        action: "proc.exec",
        command: "sudo shutdown -h now",
      }),
    ).toThrow("Command matched commandDeny policy");

    expect(() =>
      engine.assertAllowed({
        action: "fs.remove",
        path: "/etc/shadow",
        destructive: true,
      }),
    ).toThrow("denied by policy");
  });

  test("allows destructive filesystem operations only under allowed prefixes", () => {
    const engine = policy();

    expect(
      engine.assertAllowed({
        action: "fs.remove",
        path: "/tmp/build-cache",
        destructive: true,
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: true,
      }),
    );

    expect(() =>
      engine.assertAllowed({
        action: "fs.remove",
        path: "/opt/app",
        destructive: true,
      }),
    ).toThrow("outside allowed prefixes");
  });

  test("explain mode returns policy verdicts without throwing", () => {
    const observer = jest.fn();
    const engine = new PolicyEngine(policy().getEffectivePolicy(), observer);

    const decision = engine.assertAllowed({
      action: "proc.sudo",
      command: "id",
      rawSudo: true,
      mode: "explain",
    });

    expect(decision).toEqual(
      expect.objectContaining({
        allowed: false,
        mode: "explain",
        reason: expect.stringContaining("Raw sudo"),
      }),
    );
    expect(observer).toHaveBeenCalledWith(
      decision,
      expect.objectContaining({ action: "proc.sudo" }),
    );
  });
});
