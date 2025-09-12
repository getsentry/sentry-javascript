export const GOOGLE_GENAI_INTEGRATION_NAME = 'Google_GenAI';

// https://ai.google.dev/api/rest/v1/models/generateContent
// https://ai.google.dev/api/rest/v1/chats/sendMessage
export const GOOGLE_GENAI_INSTRUMENTED_METHODS = ['models.generateContent', 'chats.create', 'sendMessage'] as const;

// Constants for internal use
export const GOOGLE_GENAI_SYSTEM_NAME = 'google_genai';
export const CHATS_CREATE_METHOD = 'chats.create';
export const CHAT_PATH = 'chat';

