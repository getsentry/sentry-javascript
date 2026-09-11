/**
 * Structural types for the subset of `@flue/runtime`'s instrumentation contract we consume.
 *
 * Declared locally rather than imported: `@flue/runtime` is ESM-only and not a dependency of this
 * package, and the SDK must not import it. Mirrors `FlueInstrumentation`, `FlueObservation` and
 * `FlueExecutionContext` as of `@flue/runtime` 2.x.
 */

/** Token counts and Flue-computed costs on a settled turn. */
export interface FlueUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
}

/** Mirrors `ModelRequestInfo`. */
export interface FlueModelRequestInfo {
  requestedModel?: string;
  /** Provider slug (`anthropic`, `openrouter`) — what `gen_ai.provider.name` wants. */
  providerId?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningLevel?: string;
  serverAddress?: string;
  serverPort?: number;
}

/** Mirrors `ModelRequestInput` — the content half of `ModelRequest`, on `turn_request` only. */
export interface FlueModelRequestInput {
  systemPrompt?: string;
  messages?: unknown[];
  tools?: unknown[];
}

/** `turn_request` carries `ModelRequest`, which is `ModelRequestInfo` plus the input. */
export interface FlueModelRequest extends FlueModelRequestInfo {
  input?: FlueModelRequestInput;
}

/** Mirrors `ModelResponse`. */
export interface FlueModelResponse {
  responseId?: string;
  responseModel?: string;
  output?: unknown;
  usage?: FlueUsage;
  finishReason?: string;
}

/**
 * One event from Flue's observation stream. Only the fields we read are declared; Flue emits more
 * event types than are handled here, and unknown types are ignored.
 */
export interface FlueObservation {
  type: string;
  agentName?: string;
  conversationId?: string;
  session?: string;
  turnId?: string;
  taskId?: string;
  submissionId?: string;
  operationId?: string;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  purpose?: string;
  durationMs?: number;
  request?: FlueModelRequest;
  args?: unknown;
  result?: unknown;
  response?: FlueModelResponse;
}

/** The execution unit an interceptor wraps. */
export interface FlueExecutionOperation {
  type: string;
  operationId?: string;
  operationKind?: string;
  turnId?: string;
  toolCallId?: string;
}

/** Mirrors `FlueTraceCarrier` — the W3C headers Flue persists at admission. */
export interface FlueTraceCarrier {
  traceparent: string;
  tracestate?: string;
}

export interface FlueExecutionContext {
  traceCarrier?: FlueTraceCarrier;
  agentName?: string;
  submissionId?: string;
  conversationId?: string;
  session?: string;
  turnId?: string;
  taskId?: string;
}

export interface FlueEventContext {
  agentName?: string;
}

/** The object `instrument()` accepts. */
export interface FlueInstrumentation {
  key: symbol;
  observe: (observation: FlueObservation, ctx: FlueEventContext) => void;
  interceptor: <T>(operation: FlueExecutionOperation, ctx: FlueExecutionContext, next: () => Promise<T>) => Promise<T>;
  dispose: () => void;
}
