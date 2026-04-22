import { describe, expect, jest, test } from "@jest/globals";
import { ErrorCode } from "../../src/types.js";
import { createProcessService } from "../../src/process.js";
import { createAllowPolicy, createSessionInfo, createTestConfig } from "./helpers.js";

function createDeps() {
  const execCommand = jest.fn() as any;
  const session = { info: createSessionInfo(), ssh: { execCommand } };
  const sessionManager = {
    getSession: jest.fn(() => session) as any,
    getOSInfo: jest.fn(async () => ({
      platform: "linux" as const,
      distro: "ubuntu",
      version: "22.04",
      arch: "x64",
      shell: "bash",
      packageManager: "apt" as const,
      init: "systemd" as const,
      defaultShell: "bash" as const,
    })) as any,
  };

  return {
    config: createTestConfig(),
    execCommand,
    policy: createAllowPolicy(),
    sessionManager,
  };
}

describe("createProcessService", () => {
  test("executes commands successfully", async () => {
    const { config, execCommand, policy, sessionManager } = createDeps();
    execCommand.mockResolvedValue({ code: 0, stdout: "ok", stderr: "" });
    const service = createProcessService({ sessionManager, config, policy } as any);

    const result = await service.execCommand("session-1", "echo ok", "/tmp", {
      NAME: "value",
    });

    expect(result).toEqual(
      expect.objectContaining({
        code: 0,
        stdout: "ok",
      }),
    );
    expect(execCommand.mock.calls[0]?.[0]).toContain("bash -lc");
  });

  test("fails when session is missing", async () => {
    const { config, policy, sessionManager } = createDeps();
    sessionManager.getSession.mockReturnValue(undefined);
    const service = createProcessService({ sessionManager, config, policy } as any);

    await expect(service.execCommand("missing", "echo ok")).rejects.toThrow(
      "Session missing not found or expired",
    );
  });

  test("surfaces timeout errors", async () => {
    const { config, execCommand, policy, sessionManager } = createDeps();
    execCommand.mockImplementation(() => new Promise(() => undefined));
    const service = createProcessService({ sessionManager, config, policy } as any);

    await expect(
      service.execCommand("session-1", "sleep 10", undefined, undefined, 10),
    ).rejects.toMatchObject({ code: ErrorCode.ETIMEOUT });
  });

  test("rejects sudo on windows hosts", async () => {
    const { config, policy, sessionManager } = createDeps();
    sessionManager.getOSInfo.mockResolvedValue({
      platform: "windows",
      distro: "windows",
      version: "11",
      arch: "x64",
      shell: "powershell",
      packageManager: "winget",
      init: "windows-service",
    });
    const service = createProcessService({ sessionManager, config, policy } as any);

    await expect(service.execSudo("session-1", "dir")).rejects.toMatchObject({
      code: ErrorCode.ENOSUDO,
    });
  });

  test("wraps sudo authentication failures", async () => {
    const { config, execCommand, policy, sessionManager } = createDeps();
    execCommand.mockResolvedValue({
      code: 1,
      stdout: "",
      stderr: "Sorry, try again",
    });
    const service = createProcessService({ sessionManager, config, policy } as any);

    await expect(service.execSudo("session-1", "apt-get update", "secret")).rejects.toMatchObject({
      code: ErrorCode.ENOSUDO,
    });
  });

  test("commandExists and getAvailableShell probe the remote host", async () => {
    const { config, execCommand, policy, sessionManager } = createDeps();
    execCommand
      .mockResolvedValueOnce({ code: 1, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 1, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "/bin/sh", stderr: "" })
      .mockRejectedValueOnce(new Error("boom"));

    const service = createProcessService({ sessionManager, config, policy } as any);

    await expect(service.getAvailableShell("session-1")).resolves.toBe("sh");
    await expect(service.commandExists("session-1", "git")).resolves.toBe(false);
  });

  test("execWithShell wraps environment and cwd", async () => {
    const { config, execCommand, policy, sessionManager } = createDeps();
    execCommand
      .mockResolvedValueOnce({ code: 0, stdout: "/bin/bash", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "done", stderr: "" });
    const service = createProcessService({ sessionManager, config, policy } as any);

    const result = await service.execWithShell("session-1", "echo $NAME", "/srv", {
      NAME: "demo",
    });

    expect(result.code).toBe(0);
    expect(execCommand.mock.calls[1]?.[0]).toContain("bash -lc");
    expect(execCommand.mock.calls[1]?.[0]).toContain("cd");
  });

  test("wraps non-timeout command failures", async () => {
    const { config, execCommand, policy, sessionManager } = createDeps();
    execCommand.mockRejectedValue(new Error("network down"));
    const service = createProcessService({ sessionManager, config, policy } as any);

    await expect(service.execCommand("session-1", "echo ok")).rejects.toMatchObject({
      code: ErrorCode.ECONN,
    });
  });
});
