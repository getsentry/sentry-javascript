export const OPENAI_INTEGRATION_NAME = 'OpenAI';

// https://platform.openai.com/docs/quickstart?api-mode=responses
// https://platform.openai.com/docs/quickstart?api-mode=chat
export const INSTRUMENTED_METHODS = ['responses.create', 'chat.completions.create'] as const;
export const RESPONSE_EVENT_TYPES = [
  'response.created',
  'response.in_progress',
  'response.failed',
  'response.completed',
  'response.incomplete',
  'response.queued',
  'response.output_text.delta',
] as const;
