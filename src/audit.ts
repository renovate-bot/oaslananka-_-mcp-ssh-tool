import { redactSensitiveData } from "./logging.js";
import type { PolicyDecision } from "./policy.js";

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  sessionId?: string;
  host?: string;
  username?: string;
  target?: string;
  allowed: boolean;
  mode?: string;
  reason?: string;
}

export class AuditLog {
  private readonly events: AuditEvent[] = [];
  private sequence = 0;

  constructor(private readonly maxEvents = 500) {}

  record(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    const auditEvent: AuditEvent = {
      ...event,
      id: `audit-${Date.now()}-${++this.sequence}`,
      timestamp: new Date().toISOString(),
    };

    this.events.push(redactSensitiveData(auditEvent) as AuditEvent);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }

    return auditEvent;
  }

  recordPolicyDecision(
    decision: PolicyDecision,
    details: Omit<AuditEvent, "id" | "timestamp" | "allowed" | "mode" | "reason">,
  ): AuditEvent {
    return this.record({
      ...details,
      allowed: decision.allowed,
      mode: decision.mode,
      ...(decision.reason ? { reason: decision.reason } : {}),
    });
  }

  list(limit = 100): AuditEvent[] {
    return this.events.slice(-limit).map((event) => ({ ...event }));
  }
}
