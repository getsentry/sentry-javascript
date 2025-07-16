export const INTEGRATION_NAME = 'OpenAI';

// https://platform.openai.com/docs/quickstart?api-mode=responses
// https://platform.openai.com/docs/quickstart?api-mode=chat
export const INSTRUMENTED_METHODS = ['responses.create', 'chat.completions.create'] as const;
