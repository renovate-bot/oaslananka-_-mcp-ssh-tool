import { createPolicyError } from "./errors.js";
import { checkCommandSafety } from "./safety.js";
import type { PolicyMode } from "./types.js";

export interface PolicyConfig {
  mode: PolicyMode;
  allowRootLogin: boolean;
  allowRawSudo: boolean;
  allowDestructiveCommands: boolean;
  allowDestructiveFs: boolean;
  allowedHosts: string[];
  commandAllow: string[];
  commandDeny: string[];
  pathAllowPrefixes: string[];
  pathDenyPrefixes: string[];
}

export type PolicyAction =
  | "ssh.open"
  | "proc.exec"
  | "proc.sudo"
  | "fs.read"
  | "fs.write"
  | "fs.remove"
  | "fs.mkdir"
  | "fs.rename"
  | "ensure.package"
  | "ensure.service"
  | "ensure.lines"
  | "patch.apply"
  | "transfer.upload"
  | "transfer.download"
  | "tunnel.local"
  | "tunnel.remote";

export interface PolicyContext {
  action: PolicyAction;
  host?: string;
  username?: string;
  command?: string;
  path?: string;
  secondaryPath?: string;
  mode?: PolicyMode;
  rawSudo?: boolean;
  destructive?: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  mode: PolicyMode;
  action: PolicyAction;
  reason?: string;
  hint?: string;
  riskLevel?: string;
}

export type PolicyDecisionObserver = (decision: PolicyDecision, context: PolicyContext) => void;

const DEFAULT_ALLOWED_MUTATION_PREFIXES = ["/tmp", "/var/tmp", "/home", "/Users"];

function compile(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}

function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => compile(pattern)?.test(value));
}

function normalisePathPrefix(prefix: string): string {
  if (prefix === "/") {
    return "/";
  }
  return prefix.replace(/[\\/]+$/, "");
}

function isPathUnder(pathValue: string, prefix: string): boolean {
  const normalizedPrefix = normalisePathPrefix(prefix);
  if (normalizedPrefix === "/") {
    return true;
  }
  const normalizedPath = pathValue.replace(/\\/g, "/");
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

function denied(decision: Omit<PolicyDecision, "allowed">): PolicyDecision {
  return { ...decision, allowed: false };
}

function allowed(decision: Omit<PolicyDecision, "allowed">): PolicyDecision {
  return { ...decision, allowed: true };
}

export class PolicyEngine {
  constructor(
    private readonly config: PolicyConfig,
    private readonly observer?: PolicyDecisionObserver,
  ) {}

  getEffectivePolicy(): PolicyConfig {
    return {
      ...this.config,
      allowedHosts: [...this.config.allowedHosts],
      commandAllow: [...this.config.commandAllow],
      commandDeny: [...this.config.commandDeny],
      pathAllowPrefixes: [...this.config.pathAllowPrefixes],
      pathDenyPrefixes: [...this.config.pathDenyPrefixes],
    };
  }

  evaluate(context: PolicyContext): PolicyDecision {
    const mode = context.mode ?? this.config.mode;

    if (context.host && this.config.allowedHosts.length > 0) {
      const hostAllowed = this.config.allowedHosts.some(
        (host) => host === context.host || matchesAny(context.host ?? "", [host]),
      );
      if (!hostAllowed) {
        return denied({
          mode,
          action: context.action,
          reason: `Host ${context.host} is not allowed by policy`,
          hint: "Add the host to allowedHosts or use an SSH config alias that is allowed.",
        });
      }
    }

    if (context.username === "root" && !this.config.allowRootLogin) {
      return denied({
        mode,
        action: context.action,
        reason: "Root SSH login is disabled by policy",
        hint: "Connect as an unprivileged user and use approved ensure tools where possible.",
      });
    }

    if (context.rawSudo && !this.config.allowRawSudo) {
      return denied({
        mode,
        action: context.action,
        reason: "Raw sudo command execution is disabled by policy",
        hint: "Use an idempotent ensure_* tool or enable allowRawSudo explicitly.",
      });
    }

    if (context.command) {
      if (
        this.config.commandDeny.length > 0 &&
        matchesAny(context.command, this.config.commandDeny)
      ) {
        return denied({
          mode,
          action: context.action,
          reason: "Command matched commandDeny policy",
          hint: "Review the command or adjust the policy.",
        });
      }

      if (
        this.config.commandAllow.length > 0 &&
        !matchesAny(context.command, this.config.commandAllow)
      ) {
        return denied({
          mode,
          action: context.action,
          reason: "Command does not match commandAllow policy",
          hint: "Use an allowed command or update commandAllow.",
        });
      }

      const safety = checkCommandSafety(context.command);
      if (!safety.safe && !this.config.allowDestructiveCommands) {
        return denied({
          mode,
          action: context.action,
          reason: safety.warning ?? "Command is considered unsafe",
          hint:
            safety.suggestion ?? "Review the command before enabling destructive command policy.",
          ...(safety.riskLevel ? { riskLevel: safety.riskLevel } : {}),
        });
      }
    }

    const paths = [context.path, context.secondaryPath].filter((path): path is string =>
      Boolean(path),
    );
    for (const pathValue of paths) {
      if (this.config.pathDenyPrefixes.some((prefix) => isPathUnder(pathValue, prefix))) {
        return denied({
          mode,
          action: context.action,
          reason: `Path ${pathValue} is denied by policy`,
          hint: "Choose a different path or adjust pathDenyPrefixes.",
        });
      }

      const isDestructiveFs = (context.destructive ?? false) || context.action === "fs.remove";
      const allowPrefixes =
        this.config.pathAllowPrefixes.length > 0
          ? this.config.pathAllowPrefixes
          : DEFAULT_ALLOWED_MUTATION_PREFIXES;

      if (isDestructiveFs && !this.config.allowDestructiveFs) {
        const underAllowedPrefix = allowPrefixes.some((prefix) => isPathUnder(pathValue, prefix));
        if (!underAllowedPrefix) {
          return denied({
            mode,
            action: context.action,
            reason: `Destructive filesystem operation on ${pathValue} is outside allowed prefixes`,
            hint: `Allowed destructive prefixes: ${allowPrefixes.join(", ")}`,
          });
        }
      }
    }

    return allowed({ mode, action: context.action });
  }

  assertAllowed(context: PolicyContext): PolicyDecision {
    const decision = this.evaluate(context);
    this.observer?.(decision, context);
    if (!decision.allowed && decision.mode === "enforce") {
      throw createPolicyError(decision.reason ?? "Operation denied by policy", decision.hint);
    }
    return decision;
  }

  explain(context: PolicyContext): PolicyDecision {
    const decision = this.evaluate({ ...context, mode: "explain" });
    this.observer?.(decision, { ...context, mode: "explain" });
    return decision;
  }
}
