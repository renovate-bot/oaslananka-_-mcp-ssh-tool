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
    localPathAllowPrefixes: ["/tmp"],
    localPathDenyPrefixes: [],
    tunnelAllowBindHosts: ["127.0.0.1", "localhost"],
    tunnelDenyBindHosts: ["0.0.0.0"],
    tunnelAllowRemoteHosts: [],
    tunnelDenyRemoteHosts: [],
    tunnelAllowPorts: [],
    tunnelDenyPorts: [],
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

  test("canonicalizes deny prefixes before segment-boundary checks", () => {
    const engine = policy({
      pathDenyPrefixes: ["/var/../etc/"],
    });

    expect(() =>
      engine.assertAllowed({
        action: "fs.read",
        path: "/etc/passwd",
      }),
    ).toThrow("denied by policy");

    expect(() =>
      engine.assertAllowed({
        action: "fs.read",
        path: "/etc",
      }),
    ).toThrow("denied by policy");

    expect(
      engine.assertAllowed({
        action: "fs.read",
        path: "/etc2/passwd",
      }),
    ).toEqual(expect.objectContaining({ allowed: true }));

    expect(() =>
      engine.assertAllowed({
        action: "fs.read",
        path: "/var/../etc/passwd",
      }),
    ).toThrow("denied by policy");

    expect(
      engine.assertAllowed({
        action: "fs.read",
        path: "/etc/../home/user/file",
      }),
    ).toEqual(expect.objectContaining({ allowed: true }));

    expect(() =>
      engine.assertAllowed({
        action: "fs.read",
        path: "//etc///passwd",
      }),
    ).toThrow("denied by policy");

    expect(() =>
      engine.assertAllowed({
        action: "fs.read",
        path: "./etc/passwd",
      }),
    ).toThrow("denied by policy");

    expect(() =>
      engine.assertAllowed({
        action: "fs.read",
        path: "/tmp/a\0b",
      }),
    ).toThrow("NUL");

    expect(
      engine.assertAllowed({
        action: "fs.read",
        path: "/tmp/allowed",
      }),
    ).toEqual(expect.objectContaining({ allowed: true }));
  });

  test("enforces local transfer prefixes separately from remote path policy", () => {
    const engine = policy({
      localPathAllowPrefixes: ["/tmp/allowed"],
      localPathDenyPrefixes: ["/tmp/allowed/blocked"],
      pathAllowPrefixes: ["/remote"],
      pathDenyPrefixes: ["/remote/secret"],
    });

    expect(
      engine.assertAllowed({
        action: "transfer.local.read",
        path: "/tmp/allowed/file.txt",
      }),
    ).toEqual(expect.objectContaining({ allowed: true }));

    expect(() =>
      engine.assertAllowed({
        action: "transfer.local.read",
        path: "/tmp/allowed2/file.txt",
      }),
    ).toThrow("outside allowed prefixes");

    expect(() =>
      engine.assertAllowed({
        action: "transfer.local.write",
        path: "/tmp/allowed/blocked/file.txt",
      }),
    ).toThrow("denied by policy");
  });

  test("enforces dedicated tunnel host and port policy", () => {
    const engine = policy({
      tunnelAllowBindHosts: ["127.0.0.1"],
      tunnelDenyBindHosts: ["0.0.0.0"],
      tunnelAllowRemoteHosts: ["^db-[0-9]+\\.internal$"],
      tunnelDenyRemoteHosts: ["metadata.internal"],
      tunnelAllowPorts: ["1024-65535"],
      tunnelDenyPorts: ["2375", "2376"],
    });

    expect(
      engine.assertAllowed({
        action: "tunnel.local",
        host: "ssh-gateway",
        localBindHost: "127.0.0.1",
        localPort: 15432,
        remoteHost: "db-1.internal",
        remotePort: 5432,
      }),
    ).toEqual(expect.objectContaining({ allowed: true }));

    expect(() =>
      engine.assertAllowed({
        action: "tunnel.local",
        localBindHost: "0.0.0.0",
        localPort: 15432,
        remoteHost: "db-1.internal",
        remotePort: 5432,
      }),
    ).toThrow("bind host 0.0.0.0 is denied");

    expect(() =>
      engine.assertAllowed({
        action: "tunnel.local",
        localBindHost: "127.0.0.1",
        localPort: 15432,
        remoteHost: "metadata.internal",
        remotePort: 5432,
      }),
    ).toThrow("remote host metadata.internal is denied");

    expect(() =>
      engine.assertAllowed({
        action: "tunnel.local",
        localBindHost: "127.0.0.1",
        localPort: 80,
        remoteHost: "db-1.internal",
        remotePort: 5432,
      }),
    ).toThrow("port 80 is outside allowed policy");

    expect(() =>
      engine.assertAllowed({
        action: "tunnel.local",
        localBindHost: "127.0.0.1",
        localPort: 15432,
        remoteHost: "db-1.internal",
        remotePort: 2375,
      }),
    ).toThrow("port 2375 is denied");
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
