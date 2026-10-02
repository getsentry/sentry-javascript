/**
 * Structural subsets of the `@earendil-works/pi-durable` and `@earendil-works/pi-ai` types the
 * instrumentation reads. The SDK does not depend on either package, so only the fields used here
 * are declared, and every one of them is treated as possibly absent at runtime.
 */

import type { PiAiContext } from '../pi-ai/messages';
import type { PiAiUsage } from '../pi-ai/usage';

export interface PiAssistantMessage {
  role?: string;
  content?: unknown[];
  provider?: string;
  model?: string;
  responseModel?: string;
  responseId?: string;
  usage?: PiAiUsage;
  stopReason?: string;
  errorMessage?: string;
}

export interface PiModel {
  id?: string;
  provider?: string;
  baseUrl?: string;
}

export interface PiStreamOptions {
  temperature?: number;
  maxTokens?: number;
  reasoning?: string;
}

export interface PiEventStream {
  result(): Promise<PiAssistantMessage>;
}

/**
 * The `Models` methods that send a model request. Everything else passes through untouched. The
 * deferred methods fetch the answer of a request the provider parked, so they take a handle in
 * place of the request context.
 */
export interface PiModels {
  stream?(model: PiModel, context: PiAiContext, options?: PiStreamOptions): PiEventStream;
  streamSimple?(model: PiModel, context: PiAiContext, options?: PiStreamOptions): PiEventStream;
  complete?(model: PiModel, context: PiAiContext, options?: PiStreamOptions): Promise<PiAssistantMessage>;
  completeSimple?(model: PiModel, context: PiAiContext, options?: PiStreamOptions): Promise<PiAssistantMessage>;
  streamDeferred?(model: PiModel, handle: unknown, options?: unknown): PiEventStream;
  fetchDeferred?(model: PiModel, handle: unknown, options?: unknown): Promise<PiAssistantMessage>;
}

export interface PiToolExecutionResult {
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

export type PiCommitChange = (tx: object, current: unknown) => unknown;

/** pi-durable ids (conversations, tasks, submissions) are numbers, typed as `unknown` here. */
export interface PiTaskRuntime {
  readonly taskId: unknown;
  readonly conversationId: unknown;
  readonly signal?: AbortSignal;
  agent(context: unknown): Promise<PiAgent>;
  commit(change: PiCommitChange, context: unknown): Promise<void>;
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
  models?: PiModels;
  registry?: PiRegistryReader;
  onReport?: (error: unknown) => void;
}

export interface PiHarness {
  /** Calls `listener` when `close()` begins. */
  subscribeClose?(listener: () => void): () => void;
}
