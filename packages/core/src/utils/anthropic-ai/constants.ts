export const ANTHROPIC_AI_INTEGRATION_NAME = 'Anthropic_AI';

// https://docs.anthropic.com/en/api/messages
// https://docs.anthropic.com/en/api/models-list
export const ANTHROPIC_AI_INSTRUMENTED_METHODS = [
  'anthropic.messages.create',
  'anthropic.messages.countTokens',
  'anthropic.models.list',
  'anthropic.models.get',
  'anthropic.completions.create',
] as const;
