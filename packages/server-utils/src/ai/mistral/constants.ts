import type { InstrumentedMethodRegistry } from '../core/utils';

export const MISTRAL_INTEGRATION_NAME = 'Mistral' as const;

// Matches the value `inferSystemFromInstance` reports for `@langchain/mistralai`, so a call recorded
// through LangChain and a call recorded here carry the same provider.
export const MISTRAL_PROVIDER_NAME = 'mistralai' as const;

export const MISTRAL_ORIGIN = 'auto.ai.mistralai' as const;

// https://docs.mistral.ai/api/
// `*.stream` methods are intrinsically streaming (no `stream: true` param), so they are flagged here.
// `parse`/`parseStream` are the structured-output entry points; they call the underlying request
// functions directly rather than `this.complete`/`this.stream`, so they need their own entries and
// cannot produce a duplicate span.
export const MISTRAL_METHOD_REGISTRY = {
  'chat.complete': { operation: 'chat' },
  'chat.stream': { operation: 'chat', streaming: true },
  'chat.parse': { operation: 'chat' },
  'chat.parseStream': { operation: 'chat', streaming: true },
  'embeddings.create': { operation: 'embeddings' },
  'agents.complete': { operation: 'invoke_agent' },
  'agents.stream': { operation: 'invoke_agent', streaming: true },
} as const satisfies InstrumentedMethodRegistry;
