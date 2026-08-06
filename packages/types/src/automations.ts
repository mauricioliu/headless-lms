// automations context — domain entities, DTOs, and events.
import type { DomainEvent } from "./shared.js";

export type AutomationTrigger = string;

export interface AutomationAction {
  type: string;
  input: Record<string, unknown>;
}

export interface Automation {
  readonly id: string;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}

export type UpdateAutomationInput = Partial<CreateAutomationInput> & {
  enabled?: boolean;
};

export interface AutomationRunsQuery {
  page: number;
  pageSize: number;
  status?: AutomationRunStatus | undefined;
  sort?: string | undefined;
}

export interface AvailableAction {
  type: string;
  description: string;
  inputSchema: Record<string, unknown>;
  source: string;
}
export type AvailableActions = AvailableAction[];

export interface AvailableTriggers {
  triggers: { type: string; description: string }[];
}

export type AutomationRunStatus = "running" | "completed" | "failed";

export interface AutomationActionResult {
  index: number;
  type: string;
  status: "completed" | "failed";
  error?: string;
}

export interface AutomationRun {
  readonly id: string;
  orgId: string;
  automationId: string;
  trigger: AutomationTrigger;
  event: DomainEvent;
  status: AutomationRunStatus;
  actionResults: AutomationActionResult[];
  startedAt: string;
  finishedAt: string | null;
}

// --- engine contract (deployment port) -----
/** Serializable — action functions never cross this boundary. */
export interface AutomationDispatch {
  runId: string;
  orgId: string;
  automationId: string;
  actions: AutomationAction[];
  event: DomainEvent;
}

/** Domain-owned; the engine orders steps, retries failures, and calls finalize exactly once at the end. */
export interface AutomationExecutor {
  runAction(d: AutomationDispatch, index: number): Promise<AutomationActionResult>;
  finalize(d: AutomationDispatch, results: AutomationActionResult[]): Promise<void>;
}

export interface AutomationEngine {
  /** Container wires the domain executor before start. */
  register(executor: AutomationExecutor): void;
  /** Hand a run off. Inline: runs now. Hatchet: workflow run, no-wait. */
  dispatch(d: AutomationDispatch): Promise<void>;
  /** Worker lifecycle — started by the installation entry point after listen, stopped by buildServer onClose. */
  start(): Promise<void>;
  stop(): Promise<void>;
}
