export const OPENAI_INTEGRATION_NAME = 'OpenAI';

// https://platform.openai.com/docs/quickstart?api-mode=responses
// https://platform.openai.com/docs/quickstart?api-mode=chat
// https://platform.openai.com/docs/api-reference/conversations
export const INSTRUMENTED_METHODS = [
  'responses.create',
  'chat.completions.create',
  'embeddings.create',
  // Conversations API - for conversation state management
  // https://platform.openai.com/docs/guides/conversation-state
  'conversations.create',
] as const;
export const RESPONSES_TOOL_CALL_EVENT_TYPES = [
  'response.output_item.added',
  'response.function_call_arguments.delta',
  'response.function_call_arguments.done',
  'response.output_item.done',
] as const;
export const RESPONSE_EVENT_TYPES = [
  'response.created',
  'response.in_progress',
  'response.failed',
  'response.completed',
  'response.incomplete',
  'response.queued',
  'response.output_text.delta',
  ...RESPONSES_TOOL_CALL_EVENT_TYPES,
] as const;
