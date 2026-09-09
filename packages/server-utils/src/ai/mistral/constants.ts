import type { InstrumentedMethodRegistry } from '../core/utils';

export const MISTRAL_INTEGRATION_NAME = 'Mistral' as const;

// https://docs.mistral.ai/api/
// `*.stream` methods are intrinsically streaming (no `stream: true` param), so they are flagged here.
export const MISTRAL_METHOD_REGISTRY = {
  'chat.complete': { operation: 'chat' },
  'chat.stream': { operation: 'chat', streaming: true },
  'embeddings.create': { operation: 'embeddings' },
  'agents.complete': { operation: 'invoke_agent' },
  'agents.stream': { operation: 'invoke_agent', streaming: true },
  'fim.complete': { operation: 'text_completion' },
  'fim.stream': { operation: 'text_completion', streaming: true },
} as const satisfies InstrumentedMethodRegistry;
