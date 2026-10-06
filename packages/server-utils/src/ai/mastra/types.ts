/**
 * Duck-typed copies of the `@mastra/core/observability` shapes we read. No `@mastra/*` dependency.
 */

/**
 * Span types this exporter maps onto a `gen_ai` op. Everything else — present or future — arrives
 * as the open `string` arm and is dropped.
 */
export type MastraSpanType =
  | 'agent_run'
  | 'workflow_run'
  | 'model_generation'
  | 'tool_call'
  | 'mcp_tool_call'
  | 'provider_tool_call'
  | 'client_tool_call'
  | 'rag_embedding'
  | (string & {});

export type MastraTracingEventType = 'span_started' | 'span_updated' | 'span_ended';

export interface MastraUsageStats {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputDetails?: {
    cacheRead?: number;
    cacheWrite?: number;
  };
  outputDetails?: {
    reasoning?: number;
  };
}

export interface MastraErrorInfo {
  id?: string;
  name?: string;
  message: string;
}

/** Fields that map onto a Sentry convention attribute. Everything else Mastra sets is ignored. */
export interface MastraSpanAttributes {
  // model_generation / rag_embedding
  model?: string;
  provider?: string;
  responseModel?: string;
  responseId?: string;
  finishReason?: string;
  streaming?: boolean;
  usage?: MastraUsageStats;
  parameters?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    stopSequences?: string[];
    seed?: number;
  };
  // tool_call / mcp_tool_call / provider_tool_call / client_tool_call
  toolDescription?: string;
  // agent_run / workflow_run
  instructions?: string;
  prompt?: string;
  conversationId?: string;
  availableTools?: unknown;
}

export interface MastraExportedSpan {
  id: string;
  parentSpanId?: string;
  /** Mastra's own name; unused for Sentry span names. */
  name: string;
  type: MastraSpanType;
  startTime: Date;
  endTime?: Date;
  /** Point-in-time marker with no duration; dropped. */
  isEvent?: boolean;
  entityId?: string;
  entityName?: string;
  input?: unknown;
  output?: unknown;
  attributes?: MastraSpanAttributes;
  metadata?: { threadId?: string; runId?: string };
  errorInfo?: MastraErrorInfo;
}

export interface MastraTracingEvent {
  type: MastraTracingEventType;
  exportedSpan: MastraExportedSpan;
}

/** Subset of Mastra's `ObservabilityExporter`. The rest of that interface is optional. */
export interface MastraObservabilityExporter {
  name: string;
  exportTracingEvent(event: MastraTracingEvent): Promise<void>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
