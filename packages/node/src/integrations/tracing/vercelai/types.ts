import type { Integration } from '@sentry/core';

/**
 * Telemetry configuration.
 */
export type TelemetrySettings = {
  /**
   * Enable or disable telemetry. Disabled by default while experimental.
   */
  isEnabled?: boolean;
  /**
   * Enable or disable input recording. Enabled by default.
   *
   * You might want to disable input recording to avoid recording sensitive
   * information, to reduce data transfers, or to increase performance.
   */
  recordInputs?: boolean;
  /**
   * Enable or disable output recording. Enabled by default.
   *
   * You might want to disable output recording to avoid recording sensitive
   * information, to reduce data transfers, or to increase performance.
   */
  recordOutputs?: boolean;
  /**
   * Identifier for this function. Used to group telemetry data by function.
   */
  functionId?: string;
  /**
   * Additional information to include in the telemetry data.
   */
  metadata?: Record<string, AttributeValue>;
};

/**
 * Attribute values may be any non-nullish primitive value except an object.
 *
 * null or undefined attribute values are invalid and will result in undefined behavior.
 */
export declare type AttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>;

export interface VercelAiOptions {
  /**
   * Enable or disable input recording. Enabled if `sendDefaultPii` is `true`
   * or if you set `isEnabled` to `true` in your ai SDK method telemetry settings
   */
  recordInputs?: boolean;
  /**
   * Enable or disable output recording. Enabled if `sendDefaultPii` is `true`
   * or if you set `isEnabled` to `true` in your ai SDK method telemetry settings
   */
  recordOutputs?: boolean;

  /**
   * By default, the instrumentation will register span processors only when the ai package is used.
   * If you want to register the span processors even when the ai package usage cannot be detected, you can set `force` to `true`.
   */
  force?: boolean;

  /**
   * Enable or disable truncation of recorded input messages.
   * Defaults to `true`.
   */
  enableTruncation?: boolean;
}

export interface VercelAiIntegration extends Integration {
  options: VercelAiOptions;
}

// -- Diagnostic channel event types --
// Shapes derived from the AI SDK telemetry events.
// See: https://github.com/vercel/ai/blob/main/packages/ai/core/telemetry

export type AiSdkOperationId =
  | 'ai.generateText'
  | 'ai.streamText'
  | 'ai.generateObject'
  | 'ai.streamObject'
  | 'ai.embed'
  | 'ai.embedMany'
  | 'ai.rerank';

export type AiSdkFinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown';

export interface AiSdkUsage {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
}

export interface AiSdkContentPart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
}

export interface AiSdkToolCall {
  toolCallId: string;
  toolName: string;
  input?: unknown;
}
