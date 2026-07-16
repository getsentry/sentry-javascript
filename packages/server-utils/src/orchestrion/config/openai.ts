import type { InstrumentationConfig } from '@apm-js-collab/code-transformer-bundler-plugins/core';

export const openaiConfig = [
  // OpenAI chat completions. `Completions.create` returns a thenable `APIPromise` with no callback arg,
  // so `kind: 'Auto'` resolves to `wrapPromise`. openai ships dual CJS/ESM and the matcher compares
  // `filePath` exactly, hence one entry per built file (`.js` for `require`, `.mjs` for `import`).
  ...['resources/chat/completions/completions.js', 'resources/chat/completions/completions.mjs'].map(filePath => ({
    channelName: 'chat',
    module: { name: 'openai', versionRange: '>=4.0.0 <7', filePath },
    functionQuery: { className: 'Completions', methodName: 'create', kind: 'Auto' as const },
  })),
  // OpenAI responses API — same `create(body, options)` shape as chat completions.
  ...['resources/responses/responses.js', 'resources/responses/responses.mjs'].map(filePath => ({
    channelName: 'responses',
    module: { name: 'openai', versionRange: '>=4.0.0 <7', filePath },
    functionQuery: { className: 'Responses', methodName: 'create', kind: 'Auto' as const },
  })),
  // OpenAI embeddings API — same `create(body, options)` shape as chat completions.
  ...['resources/embeddings.js', 'resources/embeddings.mjs'].map(filePath => ({
    channelName: 'embeddings',
    module: { name: 'openai', versionRange: '>=4.0.0 <7', filePath },
    functionQuery: { className: 'Embeddings', methodName: 'create', kind: 'Auto' as const },
  })),
  // OpenAI conversations API — same `create(body, options)` shape as chat completions.
  ...['resources/conversations/conversations.js', 'resources/conversations/conversations.mjs'].map(filePath => ({
    channelName: 'conversations',
    module: { name: 'openai', versionRange: '>=4.0.0 <7', filePath },
    functionQuery: { className: 'Conversations', methodName: 'create', kind: 'Auto' as const },
  })),
] satisfies InstrumentationConfig[];

export const openaiChannels = {
  OPENAI_CHAT: 'orchestrion:openai:chat',
  OPENAI_RESPONSES: 'orchestrion:openai:responses',
  OPENAI_EMBEDDINGS: 'orchestrion:openai:embeddings',
  OPENAI_CONVERSATIONS: 'orchestrion:openai:conversations',
} as const;
