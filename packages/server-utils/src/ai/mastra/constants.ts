import { GEN_AI_CHAT, GEN_AI_EMBEDDINGS, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import type { MastraSpanType } from './types';

export const MASTRA_INTEGRATION_NAME = 'Mastra' as const;

export const MASTRA_ORIGIN = 'auto.ai.mastra';

/** Not `sentry` — that is the community `@mastra/sentry` exporter name. */
export const MASTRA_EXPORTER_NAME = 'sentry-sdk';

/** Name used by the community `@mastra/sentry` package. */
export const COMMUNITY_MASTRA_SENTRY_EXPORTER_NAME = 'sentry';

/**
 * Distinguishes our exporter from the community one. `Symbol.for` so the check still matches if
 * two copies of `@sentry/server-utils` are loaded (`instanceof` would not).
 */
export const MASTRA_EXPORTER_BRAND = Symbol.for('sentry.mastra.exporter');

/**
 * Only conventional `gen_ai` ops. Unmapped Mastra types (workflow steps, processors, scorers, …)
 * are dropped; their children re-parent onto the nearest mapped ancestor.
 *
 * `op` comes from `@sentry/conventions/op`. `operationName` is a `gen_ai.operation.name` literal —
 * the conventions package has no constants for those.
 */
export const SPAN_TYPE_OPS: Readonly<Record<string, { op: string; operationName: string }>> = {
  agent_run: { op: GEN_AI_INVOKE_AGENT, operationName: 'invoke_agent' },
  workflow_run: { op: GEN_AI_INVOKE_AGENT, operationName: 'invoke_agent' },
  model_generation: { op: GEN_AI_CHAT, operationName: 'chat' },
  tool_call: { op: GEN_AI_EXECUTE_TOOL, operationName: 'execute_tool' },
  mcp_tool_call: { op: GEN_AI_EXECUTE_TOOL, operationName: 'execute_tool' },
  provider_tool_call: { op: GEN_AI_EXECUTE_TOOL, operationName: 'execute_tool' },
  client_tool_call: { op: GEN_AI_EXECUTE_TOOL, operationName: 'execute_tool' },
  rag_embedding: { op: GEN_AI_EMBEDDINGS, operationName: 'embeddings' },
};

export const TOOL_SPAN_TYPES: ReadonlySet<string> = new Set<MastraSpanType>([
  'tool_call',
  'mcp_tool_call',
  'provider_tool_call',
  'client_tool_call',
]);

/**
 * `model_inference` is omitted: Mastra nests `model_generation > model_step > model_inference`,
 * and the inference span repeats the generation — mapping both to `gen_ai.chat` duplicates it.
 */
export const MODEL_SPAN_TYPES: ReadonlySet<string> = new Set<MastraSpanType>(['model_generation']);

export const AGENT_SPAN_TYPES: ReadonlySet<string> = new Set<MastraSpanType>(['agent_run', 'workflow_run']);
