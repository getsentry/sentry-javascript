import type { InstrumentedMethodRegistry } from '../ai/utils';

export const ANTHROPIC_AI_INTEGRATION_NAME = 'Anthropic_AI';

// https://docs.anthropic.com/en/api/messages
// https://docs.anthropic.com/en/api/models-list
export const ANTHROPIC_METHOD_REGISTRY: InstrumentedMethodRegistry = {
  'messages.create': { operation: 'chat' },
  'messages.stream': { operation: 'chat', streaming: true },
  'messages.countTokens': { operation: 'chat' },
  'models.get': { operation: 'models' },
  'completions.create': { operation: 'chat' },
  'models.retrieve': { operation: 'models' },
  'beta.messages.create': { operation: 'chat' },
};
