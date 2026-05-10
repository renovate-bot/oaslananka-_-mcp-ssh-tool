import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "@jest/globals";
import { runAgentCli } from "../../src/remote/agent-cli.js";

const originalAgentConfig = process.env.SSHAUTOMATOR_AGENT_CONFIG;

afterEach(() => {
  if (originalAgentConfig === undefined) {
    delete process.env.SSHAUTOMATOR_AGENT_CONFIG;
  } else {
    process.env.SSHAUTOMATOR_AGENT_CONFIG = originalAgentConfig;
  }
});

describe("remote agent CLI", () => {
  test("fails clearly when run is called before enrollment", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sshautomator-agent-cli-"));
    process.env.SSHAUTOMATOR_AGENT_CONFIG = path.join(dir, "missing-agent.json");

    await expect(runAgentCli(["run"])).rejects.toThrow(
      /Agent is not enrolled\.\nEnroll this host first with:/u,
    );
  });
});
