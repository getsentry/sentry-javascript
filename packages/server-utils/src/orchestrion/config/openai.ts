import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

export const openaiConfig = [
  // Sync tracing preserves APIPromise's lazy body parsing; Auto would trigger it via .then().
  ...['resources/chat/completions/completions.js', 'resources/chat/completions/completions.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: 'openai', versionRange: '>=4.0.0 <8', filePath },
    functionQuery: { className: 'Completions', methodName: 'create', kind: 'Sync' as const },
  })),
  // OpenAI responses API — same `create(body, options)` shape as chat completions.
  ...['resources/responses/responses.js', 'resources/responses/responses.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: 'openai', versionRange: '>=4.0.0 <8', filePath },
    functionQuery: { className: 'Responses', methodName: 'create', kind: 'Sync' as const },
  })),
  // OpenAI embeddings API — same `create(body, options)` shape as chat completions.
  ...['resources/embeddings.js', 'resources/embeddings.mjs'].map(filePath => ({
    channelName: 'embeddings',
    module: { name: 'openai', versionRange: '>=4.0.0 <8', filePath },
    functionQuery: { className: 'Embeddings', methodName: 'create', kind: 'Sync' as const },
  })),
  // OpenAI conversations API — same `create(body, options)` shape as chat completions.
  ...['resources/conversations/conversations.js', 'resources/conversations/conversations.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: 'openai', versionRange: '>=4.0.0 <8', filePath },
    functionQuery: { className: 'Conversations', methodName: 'create', kind: 'Sync' as const },
  })),
] satisfies InstrumentationConfig[];

export const openaiModuleNames = getModuleNames(openaiConfig);

export const openaiChannels = {
  // Chat completions, the responses API, and the conversations API all report a `chat` operation with
  // identical span handling, so they share one channel.
  OPENAI_CHAT: 'orchestrion:openai:chat',
  OPENAI_EMBEDDINGS: 'orchestrion:openai:embeddings',
} as const;
