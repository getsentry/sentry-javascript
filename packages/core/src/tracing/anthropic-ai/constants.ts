export const ANTHROPIC_AI_INTEGRATION_NAME = 'Anthropic_AI';

// https://docs.anthropic.com/en/api/messages
// https://docs.anthropic.com/en/api/models-list
export const ANTHROPIC_AI_INSTRUMENTED_METHODS = [
  'messages.create',
  'messages.stream',
  'messages.countTokens',
  'models.get',
  'completions.create',
  'models.retrieve',
  'beta.messages.create',
] as const;
