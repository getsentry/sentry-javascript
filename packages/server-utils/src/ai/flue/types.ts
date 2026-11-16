/**
 * Structural types for the subset of `@flue/runtime`'s instrumentation contract we consume.
 *
 * Declared locally rather than imported: `@flue/runtime` is ESM-only and not a dependency of this
 * package, and the SDK must not import it. Mirrors `FlueInstrumentation`, `FlueObservation` and
 * `FlueExecutionContext` as of `@flue/runtime` 2.x.
 */

/**
 * Mirrors Flue's `errorInfo`, which it attaches to a failed tool observation. Flue catches
 * the throw and turns it into a tool result, so this serialized form is the only trace of it.
 */
export interface FlueErrorInfo {
  type?: string;
  name?: string;
  message?: string;
  stack?: string;
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
  taskId?: string;
  submissionId?: string;
  operationId?: string;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  errorInfo?: FlueErrorInfo;
  durationMs?: number;
  args?: unknown;
  result?: unknown;
  /** The tool result as the model sees it, on successful `tool` events. */
  effectiveResult?: unknown;
}

/** The execution unit an interceptor wraps. */
export interface FlueExecutionOperation {
  type: string;
  operationId?: string;
  operationKind?: string;
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
