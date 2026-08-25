import type { InstrumentedMethodRegistry } from '../core/utils';

export const ANTHROPIC_AI_INTEGRATION_NAME = 'Anthropic_AI' as const;

// https://docs.anthropic.com/en/api/messages
export const ANTHROPIC_METHOD_REGISTRY = {
  'messages.create': { operation: 'chat' },
  'messages.stream': { operation: 'chat', streaming: true },
  'completions.create': { operation: 'chat' },
  'beta.messages.create': { operation: 'chat' },
} as const satisfies InstrumentedMethodRegistry;
