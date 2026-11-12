/**
 * Structural subsets of the `@earendil-works/pi-durable` types the instrumentation reads. The SDK
 * does not depend on the package, so only the fields used here are declared, and every one of them
 * is treated as possibly absent at runtime.
 */

export interface PiToolExecutionResult {
  /** The content blocks the tool returns for the model, in pi-durable 1.2.0 and later. */
  output?: unknown[];
  /** The content blocks the tool returns for the model, in pi-durable versions before 1.2.0. */
  content?: unknown[];
  isError?: boolean;
}

export interface PiToolExecutionApi {
  taskId?: unknown;
  conversationId?: unknown;
  callId?: string;
  commit?(change: (tx: object) => unknown, context: unknown): Promise<unknown>;
}

export interface PiTool {
  name: string;
  description?: string;
  execute(args: unknown, api: PiToolExecutionApi, context: unknown): Promise<PiToolExecutionResult>;
}

export interface PiAgent {
  tools?: readonly PiTool[];
}

/** The tool result the model receives, as pi-durable commits it in a `pi.tool-result` entry. */
export interface PiToolResultMessage {
  toolCallId?: unknown;
  content?: unknown[];
  isError?: boolean;
}

export interface PiDocToken {
  definition?: { kind?: string };
}

export interface PiEntryToken {
  kind?: string;
}

export interface PiSettlement {
  status?: string;
  reason?: string;
}

/** The `pi.live` document; `run` is present exactly while the conversation is busy. */
export interface PiLiveState {
  run?: { inputs?: unknown[] };
}

/** The `pi.provider` document, in pi-durable 1.0.2 and later. */
export interface PiProviderState {
  sessionId?: string;
}

export type PiCommitChange = (tx: object, current: unknown) => unknown;

/** pi-durable ids (conversations, tasks, submissions) are numbers, typed as `unknown` here. */
export interface PiTaskRuntime {
  readonly taskId: unknown;
  readonly conversationId: unknown;
  readonly signal?: AbortSignal;
  agent(context: unknown): Promise<PiAgent>;
  commit(change: PiCommitChange, context: unknown): Promise<void>;
  snapshot?(token: PiDocToken, ownerId: unknown, ...rest: unknown[]): Promise<unknown>;
}

export type PiPhaseHandler = (task: unknown, runtime: PiTaskRuntime, context: unknown) => Promise<unknown>;

export interface PiTaskDefinition {
  name: string;
  phases: Record<string, PiPhaseHandler>;
  abort?: PiPhaseHandler;
}

export interface PiTask {
  definition: PiTaskDefinition;
}

export interface PiRegistrySnapshot {
  task(name: string): PiTask | undefined;
  tasks(): readonly PiTask[];
}

export interface PiRegistryReader {
  snapshot(): PiRegistrySnapshot;
  subscribe(listener: () => void): () => void;
}

export interface PiHarnessOptions {
  registry?: PiRegistryReader;
  onReport?: (error: unknown) => void;
}

export interface PiHarness {
  /** Calls `listener` when `close()` begins. */
  subscribeClose?(listener: () => void): () => void;
}
