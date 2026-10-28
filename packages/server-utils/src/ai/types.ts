/** A message in the gen_ai conventions shape, see https://develop.sentry.dev/sdk/telemetry/traces/modules/ai-agents/. */
export interface GenAiMessage {
  role: 'assistant' | 'system' | 'tool' | 'user';
  parts: GenAiMessagePart[];
  finish_reason?: string;
}

export type GenAiMessagePart = Record<string, unknown> & {
  type: 'blob' | 'object' | 'reasoning' | 'text' | 'tool_call' | 'tool_call_response';
};
